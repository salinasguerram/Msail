from rest_framework import serializers

from .models import Article


def absolute(request, file):
    if not file:
        return None
    url = file.url
    return request.build_absolute_uri(url) if request and not url.startswith("http") else url


class ArticleCardSerializer(serializers.ModelSerializer):
    """Noticia en un listado o en la portada."""

    cover = serializers.SerializerMethodField()
    cover_thumb = serializers.SerializerMethodField()
    country = serializers.CharField(source="country.iso_code", read_only=True, default=None)
    country_name = serializers.CharField(source="country.name", read_only=True, default=None)
    event = serializers.SerializerMethodField()
    boat_classes = serializers.SlugRelatedField(slug_field="slug", many=True, read_only=True)
    reading_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = Article
        fields = [
            "id",
            "slug",
            "title",
            "summary",
            "cover",
            "cover_thumb",
            "author",
            "published_at",
            "highlight",
            "country",
            "country_name",
            "event",
            "boat_classes",
            "reading_minutes",
        ]

    def get_cover(self, article):
        return absolute(self.context.get("request"), article.cover)

    def get_cover_thumb(self, article):
        return absolute(self.context.get("request"), article.cover_thumb or article.cover)

    def get_event(self, article):
        event = article.event
        return {"slug": event.slug, "name": event.name} if event and event.is_published else None


class ArticleDetailSerializer(ArticleCardSerializer):
    blocks = serializers.ListField(child=serializers.DictField(), read_only=True)
    related = serializers.SerializerMethodField()

    class Meta(ArticleCardSerializer.Meta):
        fields = ArticleCardSerializer.Meta.fields + ["blocks", "cover_credit", "source_name", "source_url", "related"]

    def get_related(self, article):
        """Hasta 3 noticias de la misma regata o, si no hay, del mismo país."""
        others = Article.visible().exclude(pk=article.pk).select_related("country", "event").prefetch_related("boat_classes")
        related = list(others.filter(event=article.event)[:3]) if article.event_id else []
        if len(related) < 3 and article.country_id:
            related += list(others.filter(country=article.country).exclude(pk__in=[a.pk for a in related])[: 3 - len(related)])
        return ArticleCardSerializer(related, many=True, context=self.context).data
