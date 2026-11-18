from datetime import date

from django.db.models import Prefetch, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import generics, permissions, serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.text import normalize

from .models import Event, EventFollow, EventMedia, EventResult, EventType
from .serializers import EventDetailSerializer, EventListSerializer, EventMediaSerializer

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
      ?following=1   solo las regatas que sigo (requiere sesión)
      ?q=texto   busca en nombre, ciudad, sede, organizador, país, región y clases; sin importar tildes
                 ni mayúsculas, y cada palabra tiene que aparecer ("fastnet 2027").
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
            # media: la primera foto de la galería es la portada si no se cargó una.
            .prefetch_related("boat_classes", "media")
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

        if params.get("following") in ("1", "true"):
            user = self.request.user
            queryset = queryset.filter(follows__user=user) if user.is_authenticated else queryset.none()

        for word in normalize(params.get("q", "")).split()[:8]:
            queryset = queryset.filter(search_text__contains=word)

        # Rango de fechas: entra toda regata que se cruce con el rango.
        start = parse_date(params.get("from"), "from")
        end = parse_date(params.get("to"), "to")
        if start:
            queryset = queryset.filter(ends_on__gte=start)
        if end:
            queryset = queryset.filter(start_date__lte=end)

        ordering = ("-start_date", "name") if when == "past" else ("start_date", "name")
        return queryset.distinct().order_by(*ordering)


class EventDetailView(generics.RetrieveAPIView):
    """Página de una regata publicada, por su slug."""

    serializer_class = EventDetailSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        return (
            Event.objects.filter(is_published=True)
            .select_related("country", "region", "organizer_club")
            .prefetch_related(
                "boat_classes",
                "categories__boat_class",
                "documents",
                "media",
                Prefetch("results", EventResult.objects.select_related("category__boat_class", "country", "boat")),
            )
        )


class GalleryPagination(PageNumberPagination):
    page_size = 24  # múltiplo de 3: la grilla queda completa


class EventMediaView(generics.ListAPIView):
    """Galería completa de una regata publicada (fotos y videos), paginada."""

    serializer_class = EventMediaSerializer
    pagination_class = GalleryPagination
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        event = generics.get_object_or_404(Event, slug=self.kwargs["slug"], is_published=True)
        return EventMedia.objects.filter(event=event)


class EventFollowView(APIView):
    """POST: seguir la regata (avisos de resultados, fechas y fotos). DELETE: dejar de seguirla."""

    permission_classes = [permissions.IsAuthenticated]

    def get_event(self, slug):
        return generics.get_object_or_404(Event, slug=slug, is_published=True)

    def response(self, event, following):
        return Response({"following": following, "followers_count": event.follows.count()})

    def post(self, request, slug):
        event = self.get_event(slug)
        EventFollow.objects.get_or_create(user=request.user, event=event)
        return self.response(event, True)

    def delete(self, request, slug):
        event = self.get_event(slug)
        EventFollow.objects.filter(user=request.user, event=event).delete()
        return self.response(event, False)
