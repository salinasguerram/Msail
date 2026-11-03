from django.contrib import admin

from .models import BoatClass, Club


@admin.register(BoatClass)
class BoatClassAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "is_olympic", "crew_size"]
    list_filter = ["category", "is_olympic"]
    search_fields = ["name"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Club)
class ClubAdmin(admin.ModelAdmin):
    list_display = ["name", "city", "country", "is_verified"]
    list_filter = ["is_verified", "country__continent", "country"]
    search_fields = ["name", "city"]
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["country", "region"]
    filter_horizontal = ["boat_classes"]
