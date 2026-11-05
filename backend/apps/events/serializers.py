from rest_framework import serializers

from .models import Event


class EventListSerializer(serializers.ModelSerializer):
    """Fila del calendario."""

    country = serializers.CharField(source="country.iso_code", read_only=True)
    country_name = serializers.CharField(source="country.name", read_only=True)
    region = serializers.CharField(source="region.name", read_only=True, default=None)
    organizer = serializers.CharField(read_only=True)
    organizer_club = serializers.IntegerField(source="organizer_club_id", read_only=True)
    boat_classes = serializers.SlugRelatedField(slug_field="slug", many=True, read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = Event
        fields = [
            "id",
            "slug",
            "name",
            "event_type",
            "status",
            "start_date",
            "end_date",
            "country",
            "country_name",
            "region",
            "city",
            "venue",
            "organizer",
            "organizer_club",
            "boat_classes",
            "latitude",
            "longitude",
        ]
