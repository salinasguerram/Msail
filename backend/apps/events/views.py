from datetime import date

from django.db.models import Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import generics, permissions, serializers

from .models import Event, EventType
from .serializers import EventListSerializer

WHEN_CHOICES = ("upcoming", "live", "past")


def parse_date(value, name):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise serializers.ValidationError({name: ["Usá el formato AAAA-MM-DD."]}) from exc


class EventListView(generics.ListAPIView):
    """
    Calendario de regatas (público). Filtros, todos opcionales y combinables:
      ?when=upcoming|live|past   próximas (incluye las en curso), en curso, o pasadas
      ?country=ES  ?region=<id>  ?club=<id>  ?class=<slug>  ?type=offshore
      ?from=AAAA-MM-DD  ?to=AAAA-MM-DD   regatas que ocurren (aunque sea en parte) dentro del rango
    Las próximas se ordenan de la más cercana a la más lejana; las pasadas, de la más reciente hacia atrás.
    """

    serializer_class = EventListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        params = self.request.query_params
        today = timezone.localdate()
        queryset = (
            Event.objects.filter(is_published=True)
            .select_related("country", "region__country", "organizer_club")
            .prefetch_related("boat_classes")
            .annotate(ends_on=Coalesce("end_date", "start_date"))
        )

        when = params.get("when", "")
        if when and when not in WHEN_CHOICES:
            raise serializers.ValidationError({"when": [f"Valores posibles: {', '.join(WHEN_CHOICES)}."]})
        if when == "upcoming":
            queryset = queryset.filter(ends_on__gte=today)
        elif when == "live":
            queryset = queryset.filter(start_date__lte=today, ends_on__gte=today)
        elif when == "past":
            queryset = queryset.filter(ends_on__lt=today)

        if country := params.get("country", "").strip().upper():
            queryset = queryset.filter(country__iso_code=country)
        if region := params.get("region", "").strip():
            queryset = queryset.filter(region_id=region) if region.isdigit() else queryset.none()
        if club := params.get("club", "").strip():
            queryset = queryset.filter(organizer_club_id=club) if club.isdigit() else queryset.none()
        if boat_class := params.get("class", "").strip():
            queryset = queryset.filter(boat_classes__slug=boat_class)
        if event_type := params.get("type", "").strip():
            if event_type not in EventType.values:
                raise serializers.ValidationError({"type": [f"Valores posibles: {', '.join(EventType.values)}."]})
            queryset = queryset.filter(event_type=event_type)

        # Rango de fechas: entra toda regata que se cruce con el rango.
        start = parse_date(params.get("from"), "from")
        end = parse_date(params.get("to"), "to")
        if start:
            queryset = queryset.filter(ends_on__gte=start)
        if end:
            queryset = queryset.filter(start_date__lte=end)

        ordering = ("-start_date", "name") if when == "past" else ("start_date", "name")
        return queryset.distinct().order_by(*ordering)
