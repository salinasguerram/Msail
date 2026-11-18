from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.boats.models import Boat

from .models import BerthRequest, Marina, MarinaPhoto, MarinaRate, RequestStatus


def absolute(request, file):
    if not file:
        return None
    url = file.url
    return request.build_absolute_uri(url) if request and not url.startswith("http") else url


def as_float(value):
    return float(value) if value is not None else None


class MarinaPhotoSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    thumbnail = serializers.SerializerMethodField()

    class Meta:
        model = MarinaPhoto
        fields = ["id", "image", "thumbnail", "caption", "credit"]

    def get_image(self, photo):
        return absolute(self.context.get("request"), photo.image)

    def get_thumbnail(self, photo):
        return absolute(self.context.get("request"), photo.thumbnail or photo.image)


class MarinaRateSerializer(serializers.ModelSerializer):
    amount = serializers.FloatField(read_only=True)
    min_length_m = serializers.FloatField(read_only=True, allow_null=True)
    max_length_m = serializers.FloatField(read_only=True, allow_null=True)

    class Meta:
        model = MarinaRate
        fields = ["id", "label", "amount", "currency", "unit", "min_length_m", "max_length_m"]


class MarinaListSerializer(serializers.ModelSerializer):
    """Marina en el listado del directorio."""

    country = serializers.CharField(source="country.iso_code", read_only=True)
    country_name = serializers.CharField(source="country.name", read_only=True)
    region = serializers.CharField(source="region.name", read_only=True, default=None)
    services = serializers.ListField(child=serializers.CharField(), read_only=True)
    max_length_m = serializers.SerializerMethodField()
    max_draft_m = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()
    # Primera tarifa informada, para mostrar "desde ..." en el listado.
    headline_rate = serializers.SerializerMethodField()

    class Meta:
        model = Marina
        fields = [
            "id",
            "slug",
            "name",
            "kind",
            "city",
            "country",
            "country_name",
            "region",
            "berths",
            "max_length_m",
            "max_draft_m",
            "services",
            "verified",
            "cover",
            "headline_rate",
            "latitude",
            "longitude",
        ]

    def get_max_length_m(self, marina):
        return as_float(marina.max_length_m)

    def get_max_draft_m(self, marina):
        return as_float(marina.max_draft_m)

    def get_headline_rate(self, marina):
        rates = list(marina.rates.all())
        return MarinaRateSerializer(rates[0]).data if rates else None

    def get_cover(self, marina):
        # Las fotos vienen precargadas y ordenadas: la primera es la portada.
        photos = list(marina.photos.all())
        return absolute(self.context.get("request"), photos[0].thumbnail or photos[0].image) if photos else None


class MarinaDetailSerializer(MarinaListSerializer):
    photos = MarinaPhotoSerializer(many=True, read_only=True)
    rates = MarinaRateSerializer(many=True, read_only=True)

    class Meta(MarinaListSerializer.Meta):
        fields = MarinaListSerializer.Meta.fields + [
            "address",
            "description",
            "website",
            "email",
            "phone",
            "whatsapp",
            "vhf_channel",
            "photos",
            "rates",
            "prices_updated_on",
            "price_notes",
        ]


class BerthRequestCreateSerializer(serializers.ModelSerializer):
    """Pedido de amarre. Si se elige un barco propio, completa nombre y medidas que falten."""

    boat = serializers.PrimaryKeyRelatedField(queryset=Boat.objects.all(), required=False, allow_null=True)
    boat_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    length_m = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True, min_value=Decimal("1"), max_value=Decimal("200"))
    beam_m = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0.5"), max_value=Decimal("50"))
    draft_m = serializers.DecimalField(max_digits=4, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0.1"), max_value=Decimal("20"))
    contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = BerthRequest
        fields = [
            "boat",
            "boat_name",
            "boat_type",
            "length_m",
            "beam_m",
            "draft_m",
            "arrival",
            "departure",
            "contact_name",
            "contact_email",
            "contact_phone",
            "message",
        ]

    def validate_boat(self, boat):
        user = self.context["request"].user
        if boat and boat.owner_id != user.id:
            raise serializers.ValidationError("Elegí uno de tus barcos.")
        return boat

    def validate(self, attrs):
        user = self.context["request"].user
        boat = attrs.get("boat")
        if boat:
            attrs["boat_name"] = attrs.get("boat_name") or boat.name
            for field in ("length_m", "beam_m", "draft_m"):
                if attrs.get(field) is None:
                    attrs[field] = getattr(boat, field)
        if not attrs.get("boat_name", "").strip():
            raise serializers.ValidationError({"boat_name": ["Indicá el nombre del barco."]})
        if attrs.get("length_m") is None:
            raise serializers.ValidationError({"length_m": ["Indicá la eslora del barco."]})
        attrs["contact_name"] = (attrs.get("contact_name") or user.get_full_name() or user.email).strip()
        attrs["contact_email"] = attrs.get("contact_email") or user.email
        candidate = BerthRequest(marina=self.context["marina"], user=user, **attrs)
        try:
            candidate.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        return attrs


class BerthRequestSerializer(serializers.ModelSerializer):
    """Solicitud vista por el navegante que la hizo."""

    marina = serializers.SerializerMethodField()
    nights = serializers.IntegerField(read_only=True)
    can_cancel = serializers.SerializerMethodField()
    length_m = serializers.FloatField()

    class Meta:
        model = BerthRequest
        fields = [
            "id",
            "marina",
            "boat_name",
            "length_m",
            "arrival",
            "departure",
            "nights",
            "status",
            "response",
            "responded_at",
            "created_at",
            "can_cancel",
        ]

    def get_marina(self, request):
        marina = request.marina
        return {"slug": marina.slug, "name": marina.name, "city": marina.city, "country_name": marina.country.name}

    def get_can_cancel(self, request):
        from django.utils import timezone

        return request.status in (RequestStatus.PENDING, RequestStatus.ACCEPTED) and request.arrival >= timezone.localdate()
