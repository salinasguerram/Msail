"""
Puntos del planeta 3D: regatas en curso y próximas, marinas y profesionales con ubicación.

Una sola respuesta liviana (sin fotos ni textos largos) para dibujar todo de una vez.
El detalle de cada punto se abre en su pantalla (regata, marina o profesional).
"""

from django.db.models import Avg, Count, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.translation import get_language
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Event
from apps.marinas.models import Marina
from apps.professionals.models import Professional


def _coords(obj):
    return float(obj.latitude), float(obj.longitude)


def event_points():
    today = timezone.localdate()
    events = (
        Event.objects.filter(is_published=True, latitude__isnull=False, longitude__isnull=False)
        .annotate(ends_on=Coalesce("end_date", "start_date"))
        .filter(ends_on__gte=today)
        .select_related("country")
        .order_by("start_date")
    )
    for event in events:
        lat, lng = _coords(event)
        yield {
            "id": f"event:{event.slug}",
            "kind": "event",
            "slug": event.slug,
            "name": event.name,
            "subtitle": ", ".join(p for p in [event.city, event.country.name] if p),
            "date": event.start_date,
            "end_date": event.end_date,
            "live": event.start_date <= today,
            "event_type": event.event_type,
            "country": event.country.iso_code,
            "country_name": event.country.name,
            "lat": lat,
            "lng": lng,
        }


def marina_points():
    for marina in Marina.objects.filter(is_published=True, latitude__isnull=False, longitude__isnull=False).select_related("country"):
        lat, lng = _coords(marina)
        yield {
            "id": f"marina:{marina.slug}",
            "kind": "marina",
            "slug": marina.slug,
            "name": marina.name,
            "subtitle": ", ".join(p for p in [marina.city, marina.country.name] if p),
            "date": None,
            "live": False,
            "max_length_m": float(marina.max_length_m) if marina.max_length_m else None,
            "berths": marina.berths,
            "services": len(marina.services),
            "country": marina.country.iso_code,
            "country_name": marina.country.name,
            "lat": lat,
            "lng": lng,
        }


def professional_points():
    english = (get_language() or "es").startswith("en")
    professionals = (
        Professional.objects.filter(is_published=True, latitude__isnull=False, longitude__isnull=False)
        .select_related("country")
        .prefetch_related("specialties")
        .annotate(
            rating_avg=Avg("reviews__rating", filter=Q(reviews__is_visible=True)),
            reviews_count=Count("reviews", filter=Q(reviews__is_visible=True), distinct=True),
        )
    )
    for professional in professionals:
        lat, lng = _coords(professional)
        specialties = [s.name_en if english else s.name_es for s in professional.specialties.all()]
        yield {
            "id": f"professional:{professional.slug}",
            "kind": "professional",
            "slug": professional.slug,
            "name": professional.name,
            "subtitle": " · ".join(specialties[:2]) or professional.city,
            "date": None,
            "live": False,
            "city": professional.city,
            "rating": round(float(professional.rating_avg), 1) if professional.rating_avg is not None else None,
            "reviews_count": professional.reviews_count,
            "country": professional.country.iso_code,
            "country_name": professional.country.name,
            "lat": lat,
            "lng": lng,
        }


class MapPointsView(APIView):
    """GET /api/map/points/ → {"points": [...], "counts": {"event": n, "marina": n, "professional": n}}"""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        points = [*event_points(), *marina_points(), *professional_points()]
        counts = {kind: sum(1 for p in points if p["kind"] == kind) for kind in ("event", "marina", "professional")}
        return Response({"points": points, "counts": counts})
