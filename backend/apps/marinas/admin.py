from django.conf import settings
from django.contrib import admin
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline

from apps.core.images import thumbnail_html

from .models import Marina, MarinaPhoto


class MarinaPhotoInline(TabularInline):
    model = MarinaPhoto
    extra = 0
    fields = ["preview", "order", "image", "caption", "credit"]
    readonly_fields = ["preview"]

    @admin.display(description="Vista previa")
    def preview(self, obj):
        return thumbnail_html(obj.thumbnail or obj.image) if obj and obj.pk else "—"


@admin.register(Marina)
class MarinaAdmin(ModelAdmin):
    """Alta y edición básica. La gestión completa (solicitudes, precios) llega en los próximos ítems."""

    list_display = ["name", "city", "country", "berths", "max_length_m", "max_draft_m", "verified", "is_published"]
    list_filter = ["is_published", "verified", "country", "fuel", "showers"]
    search_fields = ["name", "city", "address"]
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["country", "region"]
    inlines = [MarinaPhotoInline]
    readonly_fields = ["app_link"]
    fieldsets = (
        (None, {"fields": ("name", "slug", "is_published", "verified", "app_link", "description")}),
        ("Ubicación", {"fields": ("country", "region", "city", "address", "latitude", "longitude")}),
        ("Contacto", {"fields": ("website", "email", "phone", "whatsapp", "vhf_channel")}),
        ("Capacidad", {"fields": ("berths", "max_length_m", "max_draft_m")}),
        (
            "Servicios informados",
            {
                "fields": (("water", "electricity", "showers", "fuel"), ("wifi", "laundry", "security", "boatyard")),
                "description": "Marcá solo lo que la marina informa. Lo no marcado se muestra como «no informado».",
            },
        ),
    )

    @admin.display(description="En la app")
    def app_link(self, obj):
        if not obj or not obj.pk:
            return "Se genera al guardar."
        url = f"{settings.FRONTEND_URL.rstrip('/')}/marinas/{obj.slug}"
        return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', url, url)
