from django.conf import settings
from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html
from unfold.admin import ModelAdmin
from unfold.decorators import display

from apps.core.images import thumbnail_html

from .models import Article, Highlight

HIGHLIGHT_LABELS = {Highlight.DAY: "Portada del día", Highlight.WEEK: "Semana"}


@admin.register(Article)
class ArticleAdmin(ModelAdmin):
    list_display = ["preview", "title", "published_at", "status_label", "highlight_label", "country", "event", "views"]
    list_display_links = ["preview", "title"]
    list_filter = ["is_published", "highlight", "country", "boat_classes"]
    search_fields = ["title", "summary", "body", "author"]
    prepopulated_fields = {"slug": ("title",)}
    autocomplete_fields = ["country", "event"]
    filter_horizontal = ["boat_classes"]
    date_hierarchy = "published_at"
    readonly_fields = ["preview_large", "views", "app_link"]
    actions = ["make_day", "make_week", "clear_highlight", "publish", "unpublish"]
    fieldsets = (
        (None, {"fields": ("title", "slug", "summary", "body")}),
        ("Foto", {"fields": ("cover", "preview_large", "cover_credit")}),
        ("Publicación", {"fields": ("is_published", "published_at", "highlight", "author", "app_link", "views")}),
        ("Temas (para los filtros)", {"fields": ("country", "boat_classes", "event")}),
        ("Fuente", {"fields": ("source_name", "source_url")}),
    )

    @admin.display(description="")
    def preview(self, obj):
        return thumbnail_html(obj.cover_thumb or obj.cover, size=48)

    @admin.display(description="Vista previa")
    def preview_large(self, obj):
        return thumbnail_html(obj.cover_thumb or obj.cover, size=160) if obj and obj.pk else "—"

    @display(description="Estado", label={"Publicada": "success", "Programada": "info", "Borrador": "warning"})
    def status_label(self, obj):
        if not obj.is_published:
            return "Borrador"
        return "Programada" if obj.published_at > timezone.now() else "Publicada"

    @display(description="Destacada", label={"Portada del día": "danger", "Semana": "primary"})
    def highlight_label(self, obj):
        return HIGHLIGHT_LABELS.get(obj.highlight, "")

    @admin.display(description="En la app")
    def app_link(self, obj):
        if not obj or not obj.pk:
            return "Se genera al guardar."
        url = f"{settings.FRONTEND_URL.rstrip('/')}/news/{obj.slug}"
        return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', url, url)

    @admin.action(description="Poner como portada del día", permissions=["change"])
    def make_day(self, request, queryset):
        article = queryset.order_by("-published_at").first()
        if article:
            Article.objects.filter(pk=article.pk).update(highlight=Highlight.DAY)
            self.message_user(request, f"«{article.title}» es la portada del día.", messages.SUCCESS)

    @admin.action(description="Destacar en la semana", permissions=["change"])
    def make_week(self, request, queryset):
        updated = queryset.update(highlight=Highlight.WEEK)
        self.message_user(request, f"{updated} noticia(s) destacadas en la semana.", messages.SUCCESS)

    @admin.action(description="Quitar destacado", permissions=["change"])
    def clear_highlight(self, request, queryset):
        updated = queryset.update(highlight=Highlight.NONE)
        self.message_user(request, f"{updated} noticia(s) sin destacar.", messages.SUCCESS)

    @admin.action(description="Publicar", permissions=["change"])
    def publish(self, request, queryset):
        updated = queryset.update(is_published=True)
        self.message_user(request, f"{updated} noticia(s) publicadas.", messages.SUCCESS)

    @admin.action(description="Pasar a borrador", permissions=["change"])
    def unpublish(self, request, queryset):
        updated = queryset.update(is_published=False)
        self.message_user(request, f"{updated} noticia(s) en borrador.", messages.SUCCESS)
