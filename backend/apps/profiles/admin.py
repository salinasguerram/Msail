from django.contrib import admin, messages

from apps.core.images import thumbnail_html

from .models import ProfilePhoto, RaceResult, SailorProfile


class ProfilePhotoInline(admin.TabularInline):
    model = ProfilePhoto
    extra = 0
    fields = ["preview", "image", "caption", "created_at"]
    readonly_fields = ["preview", "created_at"]

    @admin.display(description="Vista previa")
    def preview(self, obj):
        return thumbnail_html(obj.image)


class RaceResultInline(admin.TabularInline):
    model = RaceResult
    extra = 0
    autocomplete_fields = ["boat_class"]
    fields = ["event_name", "date", "boat_class", "boat_name", "role", "position", "fleet_size"]


@admin.register(SailorProfile)
class SailorProfileAdmin(admin.ModelAdmin):
    list_display = ["avatar_preview", "user", "experience_level", "home_club", "available_as_crew", "is_public", "updated_at"]
    list_filter = ["experience_level", "available_as_crew", "is_public", "boat_classes"]
    search_fields = ["user__email", "user__first_name", "user__last_name", "city"]
    autocomplete_fields = ["user", "home_club"]
    filter_horizontal = ["boat_classes"]
    inlines = [ProfilePhotoInline, RaceResultInline]
    readonly_fields = ["avatar_preview"]

    @admin.display(description="Foto")
    def avatar_preview(self, obj):
        return thumbnail_html(obj.avatar, 40)
    actions = ["make_private"]

    @admin.action(description="Ocultar perfil (pasar a privado)", permissions=["change"])
    def make_private(self, request, queryset):
        updated = queryset.filter(is_public=True).update(is_public=False)
        self.message_user(request, f"{updated} perfil(es) ocultados.", messages.SUCCESS)


@admin.register(RaceResult)
class RaceResultAdmin(admin.ModelAdmin):
    list_display = ["event_name", "date", "profile", "boat_class", "position", "fleet_size"]
    list_filter = ["boat_class", "date"]
    search_fields = ["event_name", "profile__user__email", "boat_name"]
    autocomplete_fields = ["profile", "boat_class"]
    date_hierarchy = "date"
