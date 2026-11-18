from rest_framework import serializers

from .models import FoundationSupport, Section, Video


def absolute(request, file):
    if not file:
        return None
    url = file.url
    return request.build_absolute_uri(url) if request and not url.startswith("http") else url


class SectionSerializer(serializers.ModelSerializer):
    title = serializers.CharField(read_only=True)
    body = serializers.CharField(read_only=True)
    cta_label = serializers.CharField(read_only=True)
    image = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = ["key", "title", "body", "image", "cta_label", "cta_url"]

    def get_image(self, section):
        return absolute(self.context.get("request"), section.image)


class VideoSerializer(serializers.ModelSerializer):
    thumbnail = serializers.CharField(read_only=True)

    class Meta:
        model = Video
        fields = ["id", "title", "description", "url", "kind", "language", "thumbnail"]


class FoundationSupportSerializer(serializers.ModelSerializer):
    amount = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()

    class Meta:
        model = FoundationSupport
        fields = ["id", "beneficiary", "purpose", "description", "amount", "currency", "date", "photo"]

    def get_amount(self, support):
        return float(support.amount) if support.amount is not None else None

    def get_photo(self, support):
        return absolute(self.context.get("request"), support.photo)
