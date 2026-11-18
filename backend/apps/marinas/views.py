from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count
from rest_framework import generics, permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.text import normalize

from .models import SERVICE_KEYS, BerthRequest, Marina, PlaceKind, RequestStatus
from .requests import request_created
from .serializers import BerthRequestCreateSerializer, BerthRequestSerializer, MarinaDetailSerializer, MarinaListSerializer


def parse_meters(value, name):
    if not value:
        return None
    try:
        number = Decimal(value.replace(",", "."))
    except InvalidOperation as exc:
        raise serializers.ValidationError({name: ["Ingresá un número en metros."]}) from exc
    if number <= 0 or number > 1000:
        raise serializers.ValidationError({name: ["Ingresá un número en metros."]})
    return number


def published_marinas():
    return Marina.objects.filter(is_published=True).select_related("country", "region").prefetch_related("photos", "rates")


class MarinaListView(generics.ListAPIView):
    """
    Directorio de marinas (público). Filtros opcionales y combinables:
      ?q=texto          nombre, ciudad, dirección, país o región, sin importar tildes
      ?country=ES  ?region=<id>
      ?kind=marina|club|anchorage|moorings   tipo de lugar
      ?services=fuel,showers   tienen que tener todos los servicios pedidos
      ?length=12.5      entra un barco de esa eslora (m)
      ?draft=2.1        alcanza la profundidad para ese calado (m)
      ?with_price=1     solo las que informan un precio orientativo
    Con ?length o ?draft quedan afuera las marinas que no informan ese dato.
    """

    serializer_class = MarinaListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        params = self.request.query_params
        queryset = published_marinas()
        for word in normalize(params.get("q", "")).split()[:8]:
            queryset = queryset.filter(search_text__contains=word)
        if country := params.get("country", "").strip().upper():
            queryset = queryset.filter(country__iso_code=country)
        if region := params.get("region", "").strip():
            queryset = queryset.filter(region_id=region) if region.isdigit() else queryset.none()
        if kind := params.get("kind", "").strip():
            if kind not in PlaceKind.values:
                raise serializers.ValidationError({"kind": [f"Valores posibles: {', '.join(PlaceKind.values)}."]})
            queryset = queryset.filter(kind=kind)
        services = [s for s in params.get("services", "").split(",") if s]
        unknown = set(services) - set(SERVICE_KEYS)
        if unknown:
            raise serializers.ValidationError({"services": [f"Valores posibles: {', '.join(SERVICE_KEYS)}."]})
        if services:
            queryset = queryset.filter(**{service: True for service in services})
        if length := parse_meters(params.get("length", ""), "length"):
            queryset = queryset.filter(max_length_m__gte=length)
        if draft := parse_meters(params.get("draft", ""), "draft"):
            queryset = queryset.filter(max_draft_m__gte=draft)
        if params.get("with_price") in ("1", "true"):
            queryset = queryset.filter(rates__isnull=False).distinct()
        return queryset.order_by("name")


class MarinaFilterOptionsView(APIView):
    """Países con marinas publicadas (para no ofrecer filtros vacíos)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from apps.geo.models import Country

        countries = (
            Country.objects.filter(marinas__is_published=True)
            .annotate(total=Count("marinas"))
            .order_by("name_es")
        )
        return Response({"countries": [{"value": c.iso_code, "label": c.name, "count": c.total} for c in countries]})


class MarinaDetailView(generics.RetrieveAPIView):
    serializer_class = MarinaDetailSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        return published_marinas()


class BerthRequestCreateView(APIView):
    """Pedir amarre en una marina (requiere sesión). Queda pendiente hasta que el equipo responda."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "berth_request"

    @transaction.atomic
    def post(self, request, slug):
        marina = generics.get_object_or_404(Marina, slug=slug, is_published=True)
        serializer = BerthRequestCreateSerializer(data=request.data, context={"request": request, "marina": marina})
        serializer.is_valid(raise_exception=True)
        berth_request = serializer.save(marina=marina, user=request.user)
        request_created(berth_request)
        return Response(BerthRequestSerializer(berth_request).data, status=status.HTTP_201_CREATED)


class MyBerthRequestsView(generics.ListAPIView):
    """Mis solicitudes de amarre, de la más nueva a la más vieja."""

    serializer_class = BerthRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return BerthRequest.objects.filter(user=self.request.user).select_related("marina__country")


class CancelBerthRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        berth_request = generics.get_object_or_404(BerthRequest.objects.select_related("marina__country"), pk=pk, user=request.user)
        if not BerthRequestSerializer().get_can_cancel(berth_request):
            return Response({"detail": "Esta solicitud ya no se puede cancelar."}, status=status.HTTP_400_BAD_REQUEST)
        berth_request.status = RequestStatus.CANCELLED
        berth_request.save(update_fields=["status", "updated_at"])
        return Response(BerthRequestSerializer(berth_request).data)
