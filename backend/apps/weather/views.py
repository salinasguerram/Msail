from datetime import timedelta

from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Event
from apps.geo.models import Region

from .services import ForecastUnavailable, get_forecast

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


def find_place(place_id):
    """'event:<slug>' (sede de una regata) o 'zone:<id>' (zona de navegación). None si no existe."""
    kind, _, value = (place_id or "").partition(":")
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
    Pronóstico de 7 días: ?place=event:<slug> o ?place=zone:<id>.
    Solo para los lugares de MSAIL (no acepta coordenadas sueltas, para no ser un proxy abierto).
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        place = find_place(request.query_params.get("place"))
        if not place:
            return Response({"detail": "Elegí una sede de regata o una zona de navegación."}, status=status.HTTP_404_NOT_FOUND)
        try:
            forecast = get_forecast(place["latitude"], place["longitude"])
        except ForecastUnavailable:
            return Response(
                {"detail": "El servicio de pronóstico no responde. Probá de nuevo en unos minutos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"place": place, **forecast})
