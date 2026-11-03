"""Piezas compartidas para subir fotos por la API (multipart/form-data)."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework.throttling import ScopedRateThrottle

from .images import process_image


class PhotoUploadSerializer(serializers.Serializer):
    image = serializers.FileField()
    caption = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def __init__(self, *args, max_side=None, square=False, **kwargs):
        self.max_side = max_side
        self.square = square
        super().__init__(*args, **kwargs)

    def validate_image(self, uploaded):
        try:
            return process_image(uploaded, max_side=self.max_side, square=self.square)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc


def check_limit(queryset, limit):
    if queryset.count() >= limit:
        raise serializers.ValidationError({"image": [_("Llegaste al máximo de %(limit)s fotos.") % {"limit": limit}]})


class UploadThrottle(ScopedRateThrottle):
    """Limita las subidas (POST) por usuario; ver y borrar fotos no cuenta."""

    scope_attr = "throttle_scope"

    def allow_request(self, request, view):
        if request.method != "POST":
            return True
        return super().allow_request(request, view)
