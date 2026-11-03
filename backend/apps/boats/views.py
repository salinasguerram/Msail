from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.core.photos import PhotoUploadSerializer, UploadThrottle, check_limit

from .models import Boat, BoatPhoto, CrewMember
from .serializers import BoatPhotoSerializer, BoatSerializer, BoatSummarySerializer, CrewMemberSerializer


class IsOwnerOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        boat = obj if isinstance(obj, Boat) else obj.boat
        return request.method in permissions.SAFE_METHODS or boat.owner_id == request.user.id


def visible_boats(user):
    """Públicas, más las propias y aquellas donde el usuario es tripulante."""
    visible = Q(is_public=True, owner__is_active=True)
    if user.is_authenticated:
        visible |= Q(owner=user) | Q(crew__user=user)
    return Boat.objects.filter(visible).distinct()


class MyBoatsView(generics.ListCreateAPIView):
    """Embarcaciones del usuario: las que tiene y aquellas en las que tripula."""

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        return BoatSerializer if self.request.method == "POST" else BoatSummarySerializer

    def get_queryset(self):
        user = self.request.user
        return (
            Boat.objects.filter(Q(owner=user) | Q(crew__user=user, crew__is_active=True))
            .select_related("boat_class", "country")
            .prefetch_related("photos")
            .distinct()
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class BoatDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BoatSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]

    def get_queryset(self):
        return (
            visible_boats(self.request.user)
            .select_related("owner", "boat_class", "country", "home_club__country")
            .prefetch_related("crew__user", "photos")
        )


class CrewView(generics.ListCreateAPIView):
    serializer_class = CrewMemberSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = None

    def get_boat(self):
        return get_object_or_404(visible_boats(self.request.user), pk=self.kwargs["boat_id"])

    def get_queryset(self):
        return self.get_boat().crew.select_related("user")

    def perform_create(self, serializer):
        boat = self.get_boat()
        if boat.owner_id != self.request.user.id:
            self.permission_denied(self.request)
        serializer.save(boat=boat)


class CrewMemberView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CrewMemberSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]

    def get_queryset(self):
        return CrewMember.objects.filter(
            boat__in=visible_boats(self.request.user), boat_id=self.kwargs["boat_id"]
        ).select_related("boat", "user")


class BoatPhotosView(generics.ListCreateAPIView):
    serializer_class = BoatPhotoSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    parser_classes = [MultiPartParser, FormParser]
    pagination_class = None
    throttle_classes = [UploadThrottle]
    throttle_scope = "uploads"

    def get_boat(self):
        return get_object_or_404(visible_boats(self.request.user), pk=self.kwargs["boat_id"])

    def get_queryset(self):
        return self.get_boat().photos.all()

    def create(self, request, *args, **kwargs):
        boat = self.get_boat()
        if boat.owner_id != request.user.id:
            self.permission_denied(request)
        check_limit(boat.photos.all(), BoatPhoto.MAX_PER_BOAT)
        upload = PhotoUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        photo = BoatPhoto.objects.create(
            boat=boat,
            image=upload.validated_data["image"],
            caption=upload.validated_data.get("caption", ""),
            is_cover=not boat.photos.exists(),  # la primera foto queda como portada
        )
        return Response(self.get_serializer(photo).data, status=status.HTTP_201_CREATED)


class BoatPhotoDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH {"is_cover": true} la hace portada; DELETE la borra."""

    serializer_class = BoatPhotoSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]

    def get_queryset(self):
        return BoatPhoto.objects.filter(
            boat__in=visible_boats(self.request.user), boat_id=self.kwargs["boat_id"]
        ).select_related("boat")

    @transaction.atomic
    def perform_update(self, serializer):
        if serializer.validated_data.get("is_cover"):
            serializer.instance.boat.photos.exclude(pk=serializer.instance.pk).update(is_cover=False)
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        was_cover, boat = instance.is_cover, instance.boat
        instance.delete()
        if was_cover:
            # Si se borra la portada, pasa a serlo la foto más reciente.
            next_photo = boat.photos.order_by("-created_at").first()
            if next_photo:
                next_photo.is_cover = True
                next_photo.save(update_fields=["is_cover"])
