"""Catálogos de solo lectura que usa la app para los selectores (clases, países, clubes)."""

from django.db.models import Q
from rest_framework import generics, permissions, serializers

from apps.geo.models import Country

from .models import BoatClass, Club


class BoatClassSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoatClass
        fields = ["slug", "name", "category", "is_olympic", "crew_size"]


class CountrySerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)

    class Meta:
        model = Country
        fields = ["iso_code", "name", "continent", "latitude", "longitude"]


class ClubSerializer(serializers.ModelSerializer):
    country = serializers.CharField(source="country.iso_code")

    class Meta:
        model = Club
        fields = ["id", "name", "slug", "city", "country", "latitude", "longitude", "is_verified"]


class BoatClassListView(generics.ListAPIView):
    queryset = BoatClass.objects.all()
    serializer_class = BoatClassSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None


class CountryListView(generics.ListAPIView):
    queryset = Country.objects.all()
    serializer_class = CountrySerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None


class ClubListView(generics.ListAPIView):
    """Filtros: ?search=texto&country=ES"""

    serializer_class = ClubSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = Club.objects.select_related("country")
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(city__icontains=search))
        country = self.request.query_params.get("country", "").strip().upper()
        if country:
            queryset = queryset.filter(country__iso_code=country)
        return queryset
