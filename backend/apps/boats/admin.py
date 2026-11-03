from django.contrib import admin, messages

from apps.core.images import thumbnail_html

from .models import Boat, BoatPhoto, CrewMember


class BoatPhotoInline(admin.TabularInline):
    model = BoatPhoto
    extra = 0
    fields = ["preview", "image", "caption", "is_cover", "created_at"]
    readonly_fields = ["preview", "created_at"]

    @admin.display(description="Vista previa")
    def preview(self, obj):
        return thumbnail_html(obj.image)


class CrewMemberInline(admin.TabularInline):
    model = CrewMember
    extra = 0
    autocomplete_fields = ["user"]
    fields = ["user", "name", "role", "is_active"]


@admin.register(Boat)
class BoatAdmin(admin.ModelAdmin):
    list_display = ["name", "sail_number", "boat_class", "owner", "home_port", "country", "is_public"]
    list_filter = ["is_public", "boat_class", "country"]
    search_fields = ["name", "sail_number", "model", "owner__email", "home_port"]
    autocomplete_fields = ["owner", "boat_class", "country", "home_club"]
    inlines = [BoatPhotoInline, CrewMemberInline]
    actions = ["make_private"]
    fieldsets = (
        (None, {"fields": ("owner", "name", "boat_class", "sail_number", "is_public")}),
        ("Datos técnicos", {"fields": ("model", "builder", "designer", "year_built", "hull_color",
                                       "length_m", "beam_m", "draft_m", "displacement_kg", "rating")}),
        ("Base", {"fields": ("home_port", "country", "home_club")}),
        ("Descripción", {"fields": ("description",)}),
    )

    @admin.action(description="Ocultar embarcación (pasar a privada)", permissions=["change"])
    def make_private(self, request, queryset):
        updated = queryset.filter(is_public=True).update(is_public=False)
        self.message_user(request, f"{updated} embarcación(es) ocultadas.", messages.SUCCESS)
