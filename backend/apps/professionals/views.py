from django.db import transaction
from django.db.models import Avg, Count, F, Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.text import normalize

from .models import Professional, QuoteRequest, QuoteStatus, Review, Specialty
from .quotes import quote_created
from .serializers import (
    ProfessionalDetailSerializer,
    ProfessionalListSerializer,
    QuoteRequestCreateSerializer,
    QuoteRequestSerializer,
    ReviewSerializer,
    SpecialtySerializer,
)


def published_professionals():
    return (
        Professional.objects.filter(is_published=True)
        .select_related("country", "region")
        .prefetch_related("specialties", "photos")
        .annotate(
            rating_avg=Avg("reviews__rating", filter=Q(reviews__is_visible=True)),
            reviews_count=Count("reviews", filter=Q(reviews__is_visible=True), distinct=True),
        )
    )


class ProfessionalListView(generics.ListAPIView):
    """
    Directorio de profesionales (público). Filtros opcionales y combinables:
      ?q=texto          nombre, especialidad, ciudad, zona, país o región, sin importar tildes
      ?specialty=rigging   ?country=ES   ?region=<id>
      ?order=rating     los mejor puntuados primero (por defecto, alfabético)
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
        if params.get("order") == "rating":
            return queryset.order_by(F("rating_avg").desc(nulls_last=True), "-reviews_count", "name")
        return queryset.order_by("name")


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


def get_published(slug):
    return generics.get_object_or_404(Professional, slug=slug, is_published=True)


class QuoteRequestCreateView(APIView):
    """Pedir presupuesto a un profesional (requiere sesión)."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "quote_request"

    @transaction.atomic
    def post(self, request, slug):
        professional = get_published(slug)
        serializer = QuoteRequestCreateSerializer(data=request.data, context={"request": request, "professional": professional})
        serializer.is_valid(raise_exception=True)
        quote = serializer.save(professional=professional, user=request.user)
        quote_created(quote)
        return Response(QuoteRequestSerializer(quote).data, status=status.HTTP_201_CREATED)


class MyQuotesView(generics.ListAPIView):
    serializer_class = QuoteRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return QuoteRequest.objects.filter(user=self.request.user).select_related("professional", "specialty")


class CancelQuoteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        quote = generics.get_object_or_404(QuoteRequest.objects.select_related("professional"), pk=pk, user=request.user)
        if quote.status not in (QuoteStatus.PENDING, QuoteStatus.SENT):
            return Response({"detail": "Este pedido ya no se puede cancelar."}, status=status.HTTP_400_BAD_REQUEST)
        quote.status = QuoteStatus.CANCELLED
        quote.save(update_fields=["status", "updated_at"])
        return Response(QuoteRequestSerializer(quote).data)


class ReviewListCreateView(generics.ListCreateAPIView):
    """
    GET: reseñas visibles del profesional (públicas).
    POST: dejar o actualizar mi reseña (requiere sesión con el email verificado; una por navegante).
    """

    serializer_class = ReviewSerializer
    throttle_scope = "review"

    def get_permissions(self):
        return [permissions.AllowAny()] if self.request.method == "GET" else [permissions.IsAuthenticated()]

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    def get_queryset(self):
        from apps.moderation.models import hidden_user_ids

        reviews = get_published(self.kwargs["slug"]).reviews.filter(is_visible=True)
        return reviews.exclude(user_id__in=hidden_user_ids(self.request.user)).select_related("user")

    def create(self, request, *args, **kwargs):
        professional = get_published(kwargs["slug"])
        if not request.user.email_verified:
            return Response({"detail": "Verificá tu email para dejar una reseña."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if "rating" not in serializer.validated_data:
            return Response({"rating": ["Elegí un puntaje de 1 a 5."]}, status=status.HTTP_400_BAD_REQUEST)
        review, created = Review.objects.update_or_create(
            professional=professional,
            user=request.user,
            defaults={"rating": serializer.validated_data["rating"], "comment": serializer.validated_data.get("comment", "").strip()},
        )
        return Response(
            self.get_serializer(review).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


class MyReviewView(APIView):
    """Borrar mi reseña de un profesional."""

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, slug):
        deleted, _ = Review.objects.filter(professional=get_published(slug), user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND)
