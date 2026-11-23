from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import FoundationSupport, Section, Video


@admin.register(Section)
class SectionAdmin(ModelAdmin):
    list_display = ["key", "title_es", "updated_at"]
    fieldsets = (
        (None, {"fields": ("key", "image")}),
        ("Español", {"fields": ("title_es", "body_es", "cta_label_es")}),
        ("Inglés", {"fields": ("title_en", "body_en", "cta_label_en")}),
        ("Botón", {"fields": ("cta_url",), "description": "Opcional. Ej. en La Fundación: «Quiero colaborar» → mailto:…"}),
    )


@admin.register(Video)
class VideoAdmin(ModelAdmin):
    list_display = ["title", "kind", "classes", "level", "is_premium", "views", "order", "is_published"]
    list_editable = ["order", "is_published"]
    list_filter = ["kind", "is_premium", "level", "boat_classes", "language", "is_published"]
    search_fields = ["title", "description", "body"]
    filter_horizontal = ["boat_classes"]
    readonly_fields = ["views"]
    fieldsets = (
        (None, {"fields": ("title", "kind", "description", "url", "body")}),
        (
            "Para quién",
            {
                "fields": ("boat_classes", "level", "language", "is_premium"),
                "description": "Sin clases elegidas, el contenido aparece para todas. "
                "Si es Premium, el resto de los usuarios ve el título y la descripción con un candado.",
            },
        ),
        (None, {"fields": ("order", "is_published", "views")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("boat_classes")

    @admin.display(description="clases")
    def classes(self, video):
        return ", ".join(c.name for c in video.boat_classes.all()) or "Todas"


@admin.register(FoundationSupport)
class FoundationSupportAdmin(ModelAdmin):
    list_display = ["beneficiary", "purpose", "amount", "currency", "date", "is_published"]
    list_filter = ["is_published", "currency"]
    search_fields = ["beneficiary", "purpose", "description"]
    date_hierarchy = "date"
