from decimal import Decimal, InvalidOperation

from django.db.models import Count
from rest_framework import generics, permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.text import normalize

from .models import SERVICE_KEYS, Marina
from .serializers import MarinaDetailSerializer, MarinaListSerializer


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
    return Marina.objects.filter(is_published=True).select_related("country", "region").prefetch_related("photos")


class MarinaListView(generics.ListAPIView):
    """
    Directorio de marinas (público). Filtros opcionales y combinables:
      ?q=texto          nombre, ciudad, dirección, país o región, sin importar tildes
      ?country=ES  ?region=<id>
      ?services=fuel,showers   tienen que tener todos los servicios pedidos
      ?length=12.5      entra un barco de esa eslora (m)
      ?draft=2.1        alcanza la profundidad para ese calado (m)
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
