from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Min, Q
from rest_framework import serializers

from apps.sailing.models import BoatClass, Club

from .models import ProfilePhoto, RaceResult, SailorProfile, SailingRole


def run_model_clean(instance_class, attrs, instance=None):
    """Aplica las validaciones de `clean()` del modelo y las devuelve como errores de la API."""
    candidate = instance_class(**{k: v for k, v in attrs.items() if not isinstance(v, list)})
    if instance is not None:
        for field in instance._meta.concrete_fields:
            if field.name not in attrs and not field.primary_key:
                setattr(candidate, field.attname, getattr(instance, field.attname))
    try:
        candidate.clean()
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.message_dict) from exc


class ClubSummarySerializer(serializers.ModelSerializer):
    country = serializers.CharField(source="country.iso_code")

    class Meta:
        model = Club
        fields = ["id", "name", "slug", "city", "country"]


class SailorBoatField(serializers.PrimaryKeyRelatedField):
    """Solo se puede vincular un resultado a un barco propio o en el que el usuario tripula."""

    def get_queryset(self):
        from apps.boats.models import Boat

        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return Boat.objects.none()
        user = request.user
        return Boat.objects.filter(Q(owner=user) | Q(crew__user=user)).distinct()


class RaceResultSerializer(serializers.ModelSerializer):
    boat_class = serializers.SlugRelatedField(
        slug_field="slug", queryset=BoatClass.objects.all(), required=False, allow_null=True
    )
    boat = SailorBoatField(required=False, allow_null=True)

    class Meta:
        model = RaceResult
        fields = [
            "id",
            "event_name",
            "date",
            "location",
            "boat_class",
            "boat",
            "boat_name",
            "role",
            "position",
            "fleet_size",
        ]

    def validate(self, attrs):
        boat = attrs.get("boat")
        if boat:
            # Completa nombre y clase desde el barco si no se indicaron.
            if not attrs.get("boat_name"):
                attrs["boat_name"] = boat.name
            if not attrs.get("boat_class") and boat.boat_class_id:
                attrs["boat_class"] = boat.boat_class
        run_model_clean(RaceResult, attrs, self.instance)
        return attrs


class ProfilePhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfilePhoto
        fields = ["id", "image", "caption", "created_at"]
        read_only_fields = ["id", "image", "created_at"]


class SailorProfileSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    country = serializers.CharField(source="user.country.iso_code", read_only=True, default=None)
    home_club = ClubSummarySerializer(read_only=True)
    home_club_id = serializers.PrimaryKeyRelatedField(
        source="home_club", queryset=Club.objects.all(), write_only=True, required=False, allow_null=True
    )
    roles = serializers.ListField(
        child=serializers.ChoiceField(choices=SailingRole.choices), required=False, max_length=len(SailingRole)
    )
    boat_classes = serializers.SlugRelatedField(
        slug_field="slug", queryset=BoatClass.objects.all(), many=True, required=False
    )
    avatar = serializers.ImageField(read_only=True)
    photos = ProfilePhotoSerializer(many=True, read_only=True)
    results = RaceResultSerializer(many=True, read_only=True)
    stats = serializers.SerializerMethodField()

    class Meta:
        model = SailorProfile
        fields = [
            "user_id",
            "first_name",
            "last_name",
            "country",
            "avatar",
            "bio",
            "city",
            "home_club",
            "home_club_id",
            "experience_level",
            "sailing_since",
            "roles",
            "boat_classes",
            "available_as_crew",
            "is_public",
            "photos",
            "results",
            "stats",
        ]

    def validate_roles(self, value):
        return list(dict.fromkeys(value))  # sin repetidos, manteniendo el orden

    def validate(self, attrs):
        run_model_clean(SailorProfile, attrs, self.instance)
        return attrs

    def get_stats(self, profile):
        data = profile.results.aggregate(
            regattas=Count("id"),
            podiums=Count("id", filter=Q(position__lte=3)),
            wins=Count("id", filter=Q(position=1)),
            best_position=Min("position"),
        )
        return data


class PublicSailorProfileSerializer(SailorProfileSerializer):
    """Lo que ve otro usuario: sin los datos de configuración del perfil."""

    class Meta(SailorProfileSerializer.Meta):
        fields = [f for f in SailorProfileSerializer.Meta.fields if f not in ("home_club_id", "is_public")]
