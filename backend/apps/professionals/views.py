from django.db.models import Count, Q
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.text import normalize

from .models import Professional, Specialty
from .serializers import ProfessionalDetailSerializer, ProfessionalListSerializer, SpecialtySerializer


def published_professionals():
    return (
        Professional.objects.filter(is_published=True)
        .select_related("country", "region")
        .prefetch_related("specialties", "photos")
    )


class ProfessionalListView(generics.ListAPIView):
    """
    Directorio de profesionales (público). Filtros opcionales y combinables:
      ?q=texto          nombre, especialidad, ciudad, zona, país o región, sin importar tildes
      ?specialty=rigging   ?country=ES   ?region=<id>
    """

    serializer_class = ProfessionalListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        params = self.request.query_params
        queryset = published_professionals()
        for word in normalize(params.get("q", "")).split()[:8]:
            queryset = queryset.filter(search_text__contains=word)
        if specialty := params.get("specialty", "").strip():
            queryset = queryset.filter(specialties__slug=specialty)
        if country := params.get("country", "").strip().upper():
            queryset = queryset.filter(country__iso_code=country)
        if region := params.get("region", "").strip():
            queryset = queryset.filter(region_id=region) if region.isdigit() else queryset.none()
        return queryset.distinct().order_by("name")


class ProfessionalFilterOptionsView(APIView):
    """Especialidades (todas, con cuántos profesionales hay) y países con profesionales publicados."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from apps.geo.models import Country

        specialties = Specialty.objects.annotate(
            total=Count("professionals", filter=Q(professionals__is_published=True), distinct=True)
        ).order_by("order", "name_es")  # con annotate, Django no aplica el orden del modelo
        countries = (
            Country.objects.filter(professionals__is_published=True)
            .annotate(total=Count("professionals", distinct=True))
            .order_by("name_es")
        )
        return Response(
            {
                "specialties": [{**SpecialtySerializer(s).data, "count": s.total} for s in specialties],
                "countries": [{"value": c.iso_code, "label": c.name, "count": c.total} for c in countries],
            }
        )


class ProfessionalDetailView(generics.RetrieveAPIView):
    serializer_class = ProfessionalDetailSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        return published_professionals()
