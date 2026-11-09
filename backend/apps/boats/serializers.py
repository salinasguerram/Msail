from django.contrib.auth import get_user_model
from django.db.models import Count, Min, Q
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.geo.models import Country
from apps.profiles.models import RaceResult
from apps.profiles.serializers import ClubSummarySerializer, avatar_url, run_model_clean
from apps.sailing.models import BoatClass, Club

from .models import Boat, BoatPhoto, CrewMember


class CrewMemberSerializer(serializers.ModelSerializer):
    # Se elige al tripulante buscándolo por su email exacto (cualquier cuenta activa).
    user_id = serializers.PrimaryKeyRelatedField(
        source="user",
        queryset=get_user_model().objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    display_name = serializers.CharField(read_only=True)
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = CrewMember
        fields = ["id", "user_id", "name", "display_name", "avatar", "role", "is_active"]

    def get_avatar(self, member):
        return avatar_url(member.user, self.context.get("request")) if member.user_id else None

    def validate(self, attrs):
        user = attrs.get("user")
        boat_id = self.instance.boat_id if self.instance else self.context["view"].kwargs.get("boat_id")
        if user:
            boat = Boat.objects.filter(pk=boat_id).first()
            if boat and boat.owner_id == user.id:
                raise serializers.ValidationError({"user_id": [_("El dueño ya forma parte de la embarcación.")]})
            duplicate = CrewMember.objects.filter(boat_id=boat_id, user=user)
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError({"user_id": [_("Ya está en la tripulación.")]})
        run_model_clean(CrewMember, attrs, self.instance)
        return attrs


class BoatPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoatPhoto
        fields = ["id", "image", "caption", "is_cover", "created_at"]
        read_only_fields = ["id", "image", "created_at"]


def cover_url(boat, request):
    photos = list(boat.photos.all())  # usa el prefetch si existe
    cover = next((p for p in photos if p.is_cover), photos[0] if photos else None)
    if not cover:
        return None
    url = cover.image.url
    return request.build_absolute_uri(url) if request and not url.startswith("http") else url


class BoatHistorySerializer(serializers.ModelSerializer):
    """Resultado visto desde la embarcación: quién lo cargó y en qué puesto quedó el barco."""

    boat_class = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    event = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    sailor = serializers.SerializerMethodField()

    class Meta:
        model = RaceResult
        fields = ["id", "event", "event_name", "date", "location", "boat_class", "position", "fleet_size", "sailor"]

    def get_sailor(self, result):
        user = result.profile.user
        return {"user_id": user.id, "name": user.get_full_name() or user.email.split("@")[0]}


class BoatSummarySerializer(serializers.ModelSerializer):
    boat_class = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    country = serializers.CharField(source="country.iso_code", read_only=True, default=None)
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Boat
        fields = ["id", "name", "boat_class", "model", "sail_number", "home_port", "country", "is_public", "cover"]

    def get_cover(self, boat):
        return cover_url(boat, self.context.get("request"))


class BoatSerializer(serializers.ModelSerializer):
    owner = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    boat_class = serializers.SlugRelatedField(
        slug_field="slug", queryset=BoatClass.objects.all(), required=False, allow_null=True
    )
    country = serializers.SlugRelatedField(
        slug_field="iso_code", queryset=Country.objects.all(), required=False, allow_null=True
    )
    home_club = ClubSummarySerializer(read_only=True)
    home_club_id = serializers.PrimaryKeyRelatedField(
        source="home_club", queryset=Club.objects.all(), write_only=True, required=False, allow_null=True
    )
    crew = CrewMemberSerializer(many=True, read_only=True)
    photos = BoatPhotoSerializer(many=True, read_only=True)
    cover = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()

    class Meta:
        model = Boat
        fields = [
            "id",
            "owner",
            "is_owner",
            "name",
            "boat_class",
            "model",
            "builder",
            "designer",
            "year_built",
            "sail_number",
            "hull_color",
            "length_m",
            "beam_m",
            "draft_m",
            "displacement_kg",
            "rating",
            "home_port",
            "country",
            "home_club",
            "home_club_id",
            "description",
            "is_public",
            "cover",
            "photos",
            "crew",
            "history",
            "stats",
        ]

    def validate(self, attrs):
        run_model_clean(Boat, attrs, self.instance)
        return attrs

    def get_cover(self, boat):
        return cover_url(boat, self.context.get("request"))

    def get_owner(self, boat):
        return {"user_id": boat.owner_id, "name": boat.owner.get_full_name() or boat.owner.email.split("@")[0]}

    def get_is_owner(self, boat):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and request.user.id == boat.owner_id)

    def _visible_results(self, boat):
        # Solo resultados de perfiles públicos (o del propio usuario).
        request = self.context.get("request")
        visible = Q(profile__is_public=True)
        if request and request.user.is_authenticated:
            visible |= Q(profile__user=request.user)
        return boat.results.filter(visible)

    def get_history(self, boat):
        results = self._visible_results(boat).select_related("profile__user", "boat_class")
        return BoatHistorySerializer(results, many=True).data

    def get_stats(self, boat):
        return self._visible_results(boat).aggregate(
            regattas=Count("id"),
            podiums=Count("id", filter=Q(position__lte=3)),
            wins=Count("id", filter=Q(position=1)),
            best_position=Min("position"),
        )
