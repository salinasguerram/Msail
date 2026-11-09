from rest_framework import serializers

from .models import Professional, ProfessionalPhoto, Specialty


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
            "latitude",
            "longitude",
        ]

    def get_logo(self, professional):
        return absolute(self.context.get("request"), professional.logo)

    def get_has_whatsapp(self, professional):
        return bool(professional.whatsapp)


class ProfessionalDetailSerializer(ProfessionalListSerializer):
    photos = ProfessionalPhotoSerializer(many=True, read_only=True)

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
        ]
