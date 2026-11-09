from django.conf import settings
from django.contrib import admin, messages
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline

from apps.core.images import thumbnail_html

from .models import Professional, ProfessionalPhoto, Specialty


@admin.register(Specialty)
class SpecialtyAdmin(ModelAdmin):
    list_display = ["name_es", "name_en", "slug", "icon", "order"]
    list_editable = ["order"]
    search_fields = ["name_es", "name_en"]
    prepopulated_fields = {"slug": ("name_en",)}


class ProfessionalPhotoInline(TabularInline):
    model = ProfessionalPhoto
    extra = 0
    fields = ["preview", "order", "image", "caption"]
    readonly_fields = ["preview"]

    @admin.display(description="Vista previa")
    def preview(self, obj):
        return thumbnail_html(obj.thumbnail or obj.image) if obj and obj.pk else "—"


@admin.register(Professional)
class ProfessionalAdmin(ModelAdmin):
    list_display = ["logo_preview", "name", "specialty_list", "city", "country", "verified", "is_published"]
    list_display_links = ["logo_preview", "name"]
    list_filter = ["is_published", "verified", "specialties", "country"]
    search_fields = ["name", "headline", "city", "service_area"]
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["country", "region"]
    filter_horizontal = ["specialties"]
    inlines = [ProfessionalPhotoInline]
    readonly_fields = ["app_link"]
    actions = ["publish", "unpublish", "mark_verified"]
    fieldsets = (
        (None, {"fields": ("name", "slug", "is_published", "verified", "app_link")}),
        ("Perfil", {"fields": ("specialties", "headline", "description", "logo", "languages")}),
        ("Ubicación", {"fields": ("country", "region", "city", "address", "service_area", "latitude", "longitude")}),
        ("Contacto", {"fields": ("whatsapp", "email", "phone", "website", "instagram")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("country").prefetch_related("specialties")

    @admin.display(description="")
    def logo_preview(self, obj):
        return thumbnail_html(obj.logo, size=40)

    @admin.display(description="Especialidades")
    def specialty_list(self, obj):
        return ", ".join(s.name_es for s in obj.specialties.all())

    @admin.display(description="En la app")
    def app_link(self, obj):
        if not obj or not obj.pk:
            return "Se genera al guardar."
        url = f"{settings.FRONTEND_URL.rstrip('/')}/professionals/{obj.slug}"
        return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', url, url)

    @admin.action(description="Publicar", permissions=["change"])
    def publish(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_published=True)} profesional(es) publicados.", messages.SUCCESS)

    @admin.action(description="Ocultar de la app", permissions=["change"])
    def unpublish(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_published=False)} profesional(es) ocultados.", messages.SUCCESS)

    @admin.action(description="Marcar datos como confirmados por el profesional", permissions=["change"])
    def mark_verified(self, request, queryset):
        self.message_user(request, f"{queryset.update(verified=True)} profesional(es) con datos confirmados.", messages.SUCCESS)
