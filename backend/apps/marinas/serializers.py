from rest_framework import serializers

from .models import Marina, MarinaPhoto


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


class MarinaListSerializer(serializers.ModelSerializer):
    """Marina en el listado del directorio."""

    country = serializers.CharField(source="country.iso_code", read_only=True)
    country_name = serializers.CharField(source="country.name", read_only=True)
    region = serializers.CharField(source="region.name", read_only=True, default=None)
    services = serializers.ListField(child=serializers.CharField(), read_only=True)
    max_length_m = serializers.SerializerMethodField()
    max_draft_m = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Marina
        fields = [
            "id",
            "slug",
            "name",
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
            "latitude",
            "longitude",
        ]

    def get_max_length_m(self, marina):
        return as_float(marina.max_length_m)

    def get_max_draft_m(self, marina):
        return as_float(marina.max_draft_m)

    def get_cover(self, marina):
        # Las fotos vienen precargadas y ordenadas: la primera es la portada.
        photos = list(marina.photos.all())
        return absolute(self.context.get("request"), photos[0].thumbnail or photos[0].image) if photos else None


class MarinaDetailSerializer(MarinaListSerializer):
    photos = MarinaPhotoSerializer(many=True, read_only=True)

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
        ]
