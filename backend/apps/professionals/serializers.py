from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.boats.models import Boat

from .models import Professional, ProfessionalPhoto, QuoteRequest, QuoteStatus, Review, Specialty


def absolute(request, file):
    if not file:
        return None
    url = file.url
    return request.build_absolute_uri(url) if request and not url.startswith("http") else url


class SpecialtySerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)

    class Meta:
        model = Specialty
        fields = ["slug", "name", "icon"]


class ProfessionalPhotoSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    thumbnail = serializers.SerializerMethodField()

    class Meta:
        model = ProfessionalPhoto
        fields = ["id", "image", "thumbnail", "caption"]

    def get_image(self, photo):
        return absolute(self.context.get("request"), photo.image)

    def get_thumbnail(self, photo):
        return absolute(self.context.get("request"), photo.thumbnail or photo.image)


class ProfessionalListSerializer(serializers.ModelSerializer):
    specialties = SpecialtySerializer(many=True, read_only=True)
    country = serializers.CharField(source="country.iso_code", read_only=True)
    country_name = serializers.CharField(source="country.name", read_only=True)
    region = serializers.CharField(source="region.name", read_only=True, default=None)
    logo = serializers.SerializerMethodField()
    # Para mostrar los botones de contacto directo en el listado.
    has_whatsapp = serializers.SerializerMethodField()
    # Promedio de las reseñas visibles (anotado en la consulta).
    rating = serializers.SerializerMethodField()
    reviews_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Professional
        fields = [
            "id",
            "slug",
            "name",
            "headline",
            "specialties",
            "city",
            "country",
            "country_name",
            "region",
            "logo",
            "verified",
            "has_whatsapp",
            "rating",
            "reviews_count",
            "latitude",
            "longitude",
        ]

    def get_logo(self, professional):
        return absolute(self.context.get("request"), professional.logo)

    def get_has_whatsapp(self, professional):
        return bool(professional.whatsapp)

    def get_rating(self, professional):
        value = getattr(professional, "rating_avg", None)
        return round(float(value), 1) if value is not None else None


class ReviewSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    is_client = serializers.BooleanField(read_only=True)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ["id", "rating", "comment", "author", "is_client", "is_mine", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_author(self, review):
        # Nombre y la inicial del apellido, para no exponer el nombre completo.
        user = review.user
        last = f" {user.last_name[0]}." if user.last_name else ""
        return f"{user.first_name or user.email.split('@')[0]}{last}"

    def get_is_mine(self, review):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and review.user_id == request.user.id)


class ProfessionalDetailSerializer(ProfessionalListSerializer):
    photos = ProfessionalPhotoSerializer(many=True, read_only=True)
    latest_reviews = serializers.SerializerMethodField()
    my_review = serializers.SerializerMethodField()

    class Meta(ProfessionalListSerializer.Meta):
        fields = ProfessionalListSerializer.Meta.fields + [
            "description",
            "address",
            "service_area",
            "whatsapp",
            "email",
            "phone",
            "website",
            "instagram",
            "languages",
            "photos",
            "latest_reviews",
            "my_review",
        ]

    def get_latest_reviews(self, professional):
        reviews = professional.reviews.filter(is_visible=True).select_related("user")[:3]
        return ReviewSerializer(reviews, many=True, context=self.context).data

    def get_my_review(self, professional):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        review = professional.reviews.filter(user=request.user).select_related("user").first()
        return ReviewSerializer(review, context=self.context).data if review else None


class QuoteRequestCreateSerializer(serializers.ModelSerializer):
    specialty = serializers.SlugRelatedField(slug_field="slug", queryset=Specialty.objects.all(), required=False, allow_null=True)
    boat = serializers.PrimaryKeyRelatedField(queryset=Boat.objects.all(), required=False, allow_null=True)
    contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = QuoteRequest
        fields = ["specialty", "boat", "boat_description", "details", "location", "needed_by", "contact_name", "contact_email", "contact_phone"]

    def validate_boat(self, boat):
        if boat and boat.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError("Elegí uno de tus barcos.")
        return boat

    def validate_details(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError("Contá un poco más qué necesitás (mínimo 10 caracteres).")
        return value.strip()

    def validate(self, attrs):
        user = self.context["request"].user
        boat = attrs.get("boat")
        if boat and not attrs.get("boat_description"):
            length = f", {boat.length_m.normalize():f} m" if boat.length_m else ""  # 11.20 → "11.2"
            attrs["boat_description"] = f"{boat.name}{' · ' + boat.model if boat.model else ''}{length}"[:160]
        attrs["contact_name"] = (attrs.get("contact_name") or user.get_full_name() or user.email).strip()
        attrs["contact_email"] = attrs.get("contact_email") or user.email
        candidate = QuoteRequest(professional=self.context["professional"], user=user, **attrs)
        try:
            candidate.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        return attrs


class QuoteRequestSerializer(serializers.ModelSerializer):
    professional = serializers.SerializerMethodField()
    specialty = serializers.CharField(source="specialty.name", read_only=True, default=None)
    can_cancel = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()

    class Meta:
        model = QuoteRequest
        fields = [
            "id", "professional", "specialty", "boat_description", "details", "needed_by",
            "status", "response", "responded_at", "created_at", "can_cancel", "can_review",
        ]

    def get_professional(self, quote):
        p = quote.professional
        return {"slug": p.slug, "name": p.name, "city": p.city}

    def get_can_cancel(self, quote):
        return quote.status in (QuoteStatus.PENDING, QuoteStatus.SENT)

    def get_can_review(self, quote):
        return quote.status != QuoteStatus.CANCELLED
