from rest_framework import serializers

from .models import Event, EventCategory


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


class EventCategorySerializer(serializers.ModelSerializer):
    boat_class = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = EventCategory
        fields = ["name", "boat_class", "notes"]


class EventDetailSerializer(EventListSerializer):
    """Página de la regata: todo lo del calendario más organizador completo, categorías y textos."""

    organizer_club = serializers.SerializerMethodField()
    categories = EventCategorySerializer(many=True, read_only=True)
    duration_days = serializers.SerializerMethodField()

    class Meta(EventListSerializer.Meta):
        fields = EventListSerializer.Meta.fields + [
            "categories",
            "description",
            "website",
            "entry_url",
            "duration_days",
        ]

    def get_organizer_club(self, event):
        club = event.organizer_club
        if not club:
            return None
        return {"id": club.id, "name": club.name, "city": club.city, "website": club.website}

    def get_duration_days(self, event):
        if not event.end_date:
            return None
        return (event.end_date - event.start_date).days + 1
