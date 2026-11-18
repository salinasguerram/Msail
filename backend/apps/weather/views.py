from datetime import timedelta

from django.db.models.functions import Coalesce
from django.utils import timezone
import math

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.events.models import Event
from apps.geo.models import Region

from .services import ForecastUnavailable, get_forecast, get_wind_grid

HERE_GRID = 0.25  # "Tu ubicación": las coordenadas se redondean a una grilla (~25 km) y comparten caché
HERE_NEAR_KM = 300  # hasta qué distancia se nombra la zona de navegación más cercana
UPCOMING_DAYS = 60  # regatas que se muestran como sede: en curso o que empiezan en los próximos 60 días


def upcoming_events():
    today = timezone.localdate()
    return (
        Event.objects.filter(is_published=True, latitude__isnull=False, longitude__isnull=False)
        .annotate(ends_on=Coalesce("end_date", "start_date"))
        .filter(ends_on__gte=today, start_date__lte=today + timedelta(days=UPCOMING_DAYS))
        .select_related("country")
        .order_by("start_date")
    )


def zones():
    return Region.objects.filter(latitude__isnull=False, longitude__isnull=False).select_related("country").order_by("name_es")


def describe_event(event):
    return {
        "id": f"event:{event.slug}",
        "kind": "event",
        "name": event.venue or event.city or event.name,
        "subtitle": event.name,
        "country_name": event.country.name,
        "start_date": event.start_date,
        "latitude": float(event.latitude),
        "longitude": float(event.longitude),
    }


def describe_zone(region):
    return {
        "id": f"zone:{region.pk}",
        "kind": "zone",
        "name": region.name,
        "subtitle": region.country.name,
        "country_name": region.country.name,
        "start_date": None,
        "latitude": float(region.latitude),
        "longitude": float(region.longitude),
    }


def _km(lat1, lng1, lat2, lng2):
    r = math.pi / 180
    a = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lng2 - lng1) * r / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def describe_here(value):
    """'here:<lat>,<lng>' → la ubicación de la persona, redondeada a la grilla. None si las coordenadas no sirven."""
    try:
        lat, lng = (float(part) for part in value.split(","))
    except ValueError:
        return None
    if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    lat, lng = round(round(lat / HERE_GRID) * HERE_GRID, 2), round(round(lng / HERE_GRID) * HERE_GRID, 2)
    nearest = min(zones(), key=lambda z: _km(lat, lng, float(z.latitude), float(z.longitude)), default=None)
    near = nearest if nearest and _km(lat, lng, float(nearest.latitude), float(nearest.longitude)) <= HERE_NEAR_KM else None
    return {
        "id": f"here:{lat},{lng}",
        "kind": "here",
        # El nombre ("Tu ubicación") lo pone la app en su idioma; acá va la referencia más cercana.
        "name": "",
        "subtitle": f"{near.name} · {near.country.name}" if near else "",
        "country_name": near.country.name if near else "",
        "start_date": None,
        "latitude": lat,
        "longitude": lng,
    }


def find_place(place_id):
    """'event:<slug>' (sede), 'zone:<id>' (zona de navegación) o 'here:<lat>,<lng>' (ubicación de la persona)."""
    kind, _, value = (place_id or "").partition(":")
    if kind == "here":
        return describe_here(value)
    if kind == "event":
        event = upcoming_events().filter(slug=value).first() or (
            Event.objects.filter(is_published=True, slug=value, latitude__isnull=False).select_related("country").first()
        )
        return describe_event(event) if event else None
    if kind == "zone" and value.isdigit():
        region = zones().filter(pk=value).first()
        return describe_zone(region) if region else None
    return None


class PlacesView(APIView):
    """Lugares con pronóstico: sedes de regatas en curso o próximas, y zonas de navegación."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "events": [describe_event(e) for e in upcoming_events()],
                "zones": [describe_zone(r) for r in zones()],
            }
        )


class ForecastView(APIView):
    """
    Pronóstico de 7 días (y el tiempo de ahora): ?place=event:<slug>, ?place=zone:<id> o ?place=here:<lat>,<lng>.
    Las coordenadas sueltas se redondean a una grilla de 0,25° y tienen límite de pedidos: no es un proxy abierto.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "weather"

    def get(self, request):
        place = find_place(request.query_params.get("place"))
        if not place:
            return Response({"detail": "Elegí una sede de regata, una zona de navegación o tu ubicación."}, status=status.HTTP_404_NOT_FOUND)
        try:
            forecast = get_forecast(place["latitude"], place["longitude"])
        except ForecastUnavailable:
            return Response(
                {"detail": "El servicio de pronóstico no responde. Probá de nuevo en unos minutos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"place": place, **forecast})


class WindGridView(APIView):
    """Viento en todo el planeta (grilla cada 15°) para ahora y +12/+24/+48 h. Lo usa la capa de viento del planeta 3D."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            return Response(get_wind_grid())
        except ForecastUnavailable:
            return Response(
                {"detail": "El servicio de pronóstico no responde. Probá de nuevo en unos minutos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
