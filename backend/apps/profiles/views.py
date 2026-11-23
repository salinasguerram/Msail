from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext_lazy as _
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.photos import PhotoUploadSerializer, UploadThrottle, check_limit

from .models import ProfilePhoto, RaceResult, SailorProfile
from .serializers import (
    ProfilePhotoSerializer,
    PublicSailorProfileSerializer,
    RaceResultSerializer,
    ResultDetailSerializer,
    SailorProfileSerializer,
    CrewCandidateSerializer,
)


def profile_queryset():
    return SailorProfile.objects.select_related("user__country", "home_club__country", "region__country").prefetch_related(
        "boat_classes", "photos", "results__boat_class", "results__boat"
    )


class MyProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = SailorProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        profile, _ = SailorProfile.objects.get_or_create(user=self.request.user)
        return profile_queryset().get(pk=profile.pk)


class CrewListView(generics.ListAPIView):
    """
    Tripulaciones: navegantes con perfil público que marcaron "disponible para tripular".
    Filtros: ?q=nombre o ciudad  ?class=<slug de clase>  ?role=<puesto>  ?country=AR
    """

    permission_classes = [permissions.AllowAny]

    def get_serializer_class(self):
        from .serializers import CrewMemberSerializer

        return CrewMemberSerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = (
            SailorProfile.objects.filter(available_as_crew=True, is_public=True, user__is_active=True)
            .select_related("user__country", "region")
            .prefetch_related("boat_classes")
            .order_by("user__first_name", "user__last_name")
        )
        for word in params.get("q", "").split()[:5]:
            queryset = queryset.filter(Q(user__first_name__icontains=word) | Q(user__last_name__icontains=word) | Q(city__icontains=word))
        if boat_class := params.get("class", "").strip():
            queryset = queryset.filter(boat_classes__slug=boat_class)
        if country := params.get("country", "").strip().upper():
            queryset = queryset.filter(user__country__iso_code=country)
        if role := params.get("role", "").strip():
            # Los puestos se guardan como lista: se filtra en Python (son pocos perfiles disponibles a la vez).
            ids = [p.pk for p in queryset if role in (p.roles or [])]
            queryset = queryset.filter(pk__in=ids)
        from apps.moderation.models import hidden_user_ids

        return queryset.exclude(user_id__in=hidden_user_ids(self.request.user)).distinct()


class PublicProfileView(generics.RetrieveAPIView):
    """Perfil de otro navegante. Los perfiles privados solo los ve su dueño."""

    serializer_class = PublicSailorProfileSerializer
    permission_classes = [permissions.AllowAny]

    def get_object(self):
        visible = Q(is_public=True, user__is_active=True)
        if self.request.user.is_authenticated:
            visible |= Q(user=self.request.user)
        from apps.moderation.models import hidden_user_ids

        queryset = profile_queryset().filter(visible).exclude(user_id__in=hidden_user_ids(self.request.user))
        return get_object_or_404(queryset, user_id=self.kwargs["user_id"])


class MyResultsView(generics.ListCreateAPIView):
    serializer_class = RaceResultSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return RaceResult.objects.filter(profile__user=self.request.user).select_related("boat_class")

    def perform_create(self, serializer):
        profile, _ = SailorProfile.objects.get_or_create(user=self.request.user)
        serializer.save(profile=profile)


class MyResultDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RaceResultSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Filtrar por dueño hace que el resultado de otro usuario dé 404, sin revelar que existe.
        return RaceResult.objects.filter(profile__user=self.request.user)


def my_profile(user):
    profile, _ = SailorProfile.objects.get_or_create(user=user)
    return profile


def absolute(request, url):
    return url if url.startswith("http") else request.build_absolute_uri(url)


class MyAvatarView(APIView):
    """POST: sube o reemplaza la foto de perfil (campo `image`). DELETE: la quita."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [UploadThrottle]
    throttle_scope = "uploads"

    def post(self, request):
        serializer = PhotoUploadSerializer(data=request.data, max_side=settings.AVATAR_SIDE_PX, square=True)
        serializer.is_valid(raise_exception=True)
        profile = my_profile(request.user)
        profile.avatar = serializer.validated_data["image"]
        profile.save()
        return Response({"avatar": absolute(request, profile.avatar.url)})

    def delete(self, request):
        profile = my_profile(request.user)
        if profile.avatar:
            profile.avatar.delete(save=False)
            profile.avatar = ""
            profile.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyPhotosView(generics.ListCreateAPIView):
    serializer_class = ProfilePhotoSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    pagination_class = None
    throttle_classes = [UploadThrottle]
    throttle_scope = "uploads"

    def get_queryset(self):
        return ProfilePhoto.objects.filter(profile__user=self.request.user)

    def create(self, request, *args, **kwargs):
        profile = my_profile(request.user)
        check_limit(profile.photos.all(), ProfilePhoto.MAX_PER_PROFILE)
        upload = PhotoUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        photo = ProfilePhoto.objects.create(
            profile=profile,
            image=upload.validated_data["image"],
            caption=upload.validated_data.get("caption", ""),
        )
        return Response(self.get_serializer(photo).data, status=status.HTTP_201_CREATED)


class MyPhotoDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH cambia la descripción; DELETE borra la foto y su archivo."""

    serializer_class = ProfilePhotoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ProfilePhoto.objects.filter(profile__user=self.request.user)


class SailorLookupView(APIView):
    """
    Busca un navegante por su email exacto (?email=), para sumarlo a una tripulación.
    Con el email no hay dudas entre dos personas con el mismo nombre. Solo devuelve el
    nombre y la foto, nunca el email ni el resto del perfil.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "lookup"  # evita probar emails en masa

    def get(self, request):
        email = get_user_model().objects.normalize_email(request.query_params.get("email", ""))
        if "@" not in email:
            return Response({"email": [_("Ingresá un email válido.")]}, status=status.HTTP_400_BAD_REQUEST)
        if email == request.user.email:
            return Response({"detail": _("Ese es tu propio email.")}, status=status.HTTP_400_BAD_REQUEST)
        user = get_user_model().objects.filter(email=email, is_active=True).select_related("sailor_profile").first()
        if user is None:
            return Response({"detail": _("No hay ninguna cuenta de MSAIL con ese email.")}, status=status.HTTP_404_NOT_FOUND)
        return Response(CrewCandidateSerializer(user, context={"request": request}).data)


class ResultDetailView(generics.RetrieveAPIView):
    """Un resultado. Se ve si el perfil del navegante es público o si es propio."""

    serializer_class = ResultDetailSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        visible = Q(profile__is_public=True, profile__user__is_active=True)
        if self.request.user.is_authenticated:
            visible |= Q(profile__user=self.request.user)
        return RaceResult.objects.filter(visible).select_related("profile__user__sailor_profile", "boat", "boat_class")
