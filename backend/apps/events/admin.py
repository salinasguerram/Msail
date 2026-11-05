from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Event


@admin.register(Event)
class EventAdmin(ModelAdmin):
    list_display = ["name", "start_date", "end_date", "event_type", "country", "city", "organizer_display", "is_published"]
    list_filter = ["event_type", "is_published", "country", "boat_classes"]
    search_fields = ["name", "city", "venue", "organizer_name", "organizer_club__name"]
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["country", "region", "organizer_club"]
    filter_horizontal = ["boat_classes"]
    date_hierarchy = "start_date"
    fieldsets = (
        (None, {"fields": ("name", "slug", "event_type", "is_published")}),
        ("Fechas", {"fields": ("start_date", "end_date")}),
        ("Lugar", {"fields": ("country", "region", "city", "venue", "latitude", "longitude")}),
        ("Organización", {"fields": ("organizer_club", "organizer_name", "boat_classes")}),
        ("Información", {"fields": ("description", "website", "entry_url")}),
    )

    @admin.display(description="Organizador")
    def organizer_display(self, obj):
        return obj.organizer
