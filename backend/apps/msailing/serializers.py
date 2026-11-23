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
    """Un video o lección. Si es Premium y quien lo pide no lo es, va sin el link ni el texto (`locked`)."""

    thumbnail = serializers.CharField(read_only=True)
    boat_classes = serializers.SlugRelatedField(slug_field="slug", many=True, read_only=True)
    has_lesson = serializers.SerializerMethodField()
    locked = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = [
            "id", "title", "description", "url", "kind", "language", "thumbnail",
            "boat_classes", "level", "is_premium", "has_lesson", "locked",
        ]

    def get_has_lesson(self, video):
        return bool(video.body.strip())

    def get_locked(self, video):
        return video.is_premium and not self.context.get("premium", False)

    def to_representation(self, video):
        data = super().to_representation(video)
        if data["locked"]:
            data["url"] = ""
        return data


class VideoDetailSerializer(VideoSerializer):
    body = serializers.SerializerMethodField()

    class Meta(VideoSerializer.Meta):
        fields = VideoSerializer.Meta.fields + ["body"]

    def get_body(self, video):
        return "" if self.get_locked(video) else video.body


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
