from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    event = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    # Si el aviso es de una noticia, se abre la noticia en lugar de la regata.
    article = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "event", "article", "created_at", "read"]

    def get_read(self, notification):
        return notification.read_at is not None
