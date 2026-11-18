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
    list_display = ["title", "kind", "language", "order", "is_published"]
    list_editable = ["order", "is_published"]
    list_filter = ["kind", "language", "is_published"]
    search_fields = ["title", "description"]


@admin.register(FoundationSupport)
class FoundationSupportAdmin(ModelAdmin):
    list_display = ["beneficiary", "purpose", "amount", "currency", "date", "is_published"]
    list_filter = ["is_published", "currency"]
    search_fields = ["beneficiary", "purpose", "description"]
    date_hierarchy = "date"
