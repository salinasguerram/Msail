from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.photos import PhotoUploadSerializer, UploadThrottle, check_limit

from .models import ProfilePhoto, RaceResult, SailorProfile
from .serializers import (
    ProfilePhotoSerializer,
    PublicSailorProfileSerializer,
    RaceResultSerializer,
    SailorProfileSerializer,
)


def profile_queryset():
    return SailorProfile.objects.select_related("user__country", "home_club__country").prefetch_related(
        "boat_classes", "photos", "results__boat_class", "results__boat"
    )


class MyProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = SailorProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        profile, _ = SailorProfile.objects.get_or_create(user=self.request.user)
        return profile_queryset().get(pk=profile.pk)


class PublicProfileView(generics.RetrieveAPIView):
    """Perfil de otro navegante. Los perfiles privados solo los ve su dueño."""

    serializer_class = PublicSailorProfileSerializer
    permission_classes = [permissions.AllowAny]

    def get_object(self):
        visible = Q(is_public=True, user__is_active=True)
        if self.request.user.is_authenticated:
            visible |= Q(user=self.request.user)
        return get_object_or_404(profile_queryset().filter(visible), user_id=self.kwargs["user_id"])


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
