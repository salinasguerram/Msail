from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Min, Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.events.models import Event
from apps.geo.models import Region
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


class RegionSummarySerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    country = serializers.CharField(source="country.iso_code", read_only=True)

    class Meta:
        model = Region
        fields = ["id", "name", "slug", "country"]


def avatar_url(user, request):
    profile = getattr(user, "sailor_profile", None)
    if not profile or not profile.avatar:
        return None
    url = profile.avatar.url
    return request.build_absolute_uri(url) if request and not url.startswith("http") else url


class CrewCandidateSerializer(serializers.ModelSerializer):
    """Lo que se muestra al encontrar a alguien por email: nombre y foto."""

    user_id = serializers.IntegerField(source="id", read_only=True)
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = ["user_id", "first_name", "last_name", "avatar"]

    def get_avatar(self, user):
        return avatar_url(user, self.context.get("request"))


class CrewMemberSerializer(serializers.ModelSerializer):
    """Navegante disponible para tripular, en el directorio de Tripulaciones (solo datos de su perfil público)."""

    user_id = serializers.IntegerField(source="user.id", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    avatar = serializers.SerializerMethodField()
    country = serializers.CharField(source="user.country.iso_code", read_only=True, default=None)
    country_name = serializers.CharField(source="user.country.name", read_only=True, default=None)
    region = serializers.CharField(source="region.name", read_only=True, default=None)
    boat_classes = serializers.SlugRelatedField(slug_field="slug", many=True, read_only=True)

    class Meta:
        model = SailorProfile
        fields = ["user_id", "first_name", "last_name", "avatar", "city", "region", "country", "country_name", "experience_level", "roles", "boat_classes"]

    def get_avatar(self, profile):
        if not profile.avatar:
            return None
        request = self.context.get("request")
        url = profile.avatar.url
        return request.build_absolute_uri(url) if request and not url.startswith("http") else url


class RaceResultSerializer(serializers.ModelSerializer):
    boat_class = serializers.SlugRelatedField(
        slug_field="slug", queryset=BoatClass.objects.all(), required=False, allow_null=True
    )
    boat = SailorBoatField(required=False, allow_null=True)
    event = serializers.SlugRelatedField(
        slug_field="slug", queryset=Event.objects.filter(is_published=True), required=False, allow_null=True
    )
    event_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    date = serializers.DateField(required=False)

    class Meta:
        model = RaceResult
        fields = [
            "id",
            "event",
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
        event = attrs.get("event")
        if event:
            if event.start_date > timezone.localdate():
                raise serializers.ValidationError({"event": [_("Esa regata todavía no empezó.")]})
            # Nombre, fecha y lugar salen de la regata del calendario.
            attrs["event_name"] = event.name
            attrs.setdefault("date", min(event.last_day, timezone.localdate()))
            if not attrs.get("location"):
                attrs["location"] = ", ".join(p for p in [event.city, event.country.name] if p)[:160]
        creating = self.instance is None
        if creating or "event_name" in attrs:
            name = attrs.get("event_name", "").strip()
            if not name:
                raise serializers.ValidationError({"event_name": [_("Elegí una regata del calendario o escribí su nombre.")]})
            attrs["event_name"] = name
        if creating and not attrs.get("date"):
            raise serializers.ValidationError({"date": [_("Este campo es requerido.")]})
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
    region = RegionSummarySerializer(read_only=True)
    region_id = serializers.PrimaryKeyRelatedField(
        source="region", queryset=Region.objects.all(), write_only=True, required=False, allow_null=True
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
            "region",
            "region_id",
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
        region = attrs.get("region")
        country = self.instance.user.country if self.instance else None
        if region and country and region.country_id != country.id:
            raise serializers.ValidationError({"region_id": [_("La región no pertenece a tu país.")]})
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
        fields = [f for f in SailorProfileSerializer.Meta.fields if f not in ("home_club_id", "region_id", "is_public")]


class ResultDetailSerializer(RaceResultSerializer):
    """Un resultado visto por cualquiera: quién lo logró y con qué barco."""

    sailor = serializers.SerializerMethodField()
    boat_detail = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta(RaceResultSerializer.Meta):
        fields = RaceResultSerializer.Meta.fields + ["sailor", "boat_detail", "is_mine"]

    def get_sailor(self, result):
        user = result.profile.user
        return {
            "user_id": user.id,
            "name": user.get_full_name() or user.email.split("@")[0],
            "avatar": avatar_url(user, self.context.get("request")),
        }

    def get_boat_detail(self, result):
        boat = result.boat
        if not boat:
            return None
        request = self.context.get("request")
        user = getattr(request, "user", None)
        visible = boat.is_public or (user and user.is_authenticated and (boat.owner_id == user.id or boat.crew.filter(user=user).exists()))
        return {"id": boat.id, "name": boat.name, "sail_number": boat.sail_number} if visible else None

    def get_is_mine(self, result):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and result.profile.user_id == request.user.id)
