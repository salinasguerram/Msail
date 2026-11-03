from django.contrib import admin

from .models import Country, Region


class RegionInline(admin.TabularInline):
    model = Region
    extra = 0
    prepopulated_fields = {"slug": ("name_es",)}


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ["name_es", "name_en", "iso_code", "continent"]
    list_filter = ["continent"]
    search_fields = ["name_es", "name_en", "iso_code"]
    inlines = [RegionInline]


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ["name_es", "country"]
    list_filter = ["country__continent", "country"]
    search_fields = ["name_es", "name_en"]
    prepopulated_fields = {"slug": ("name_es",)}
    autocomplete_fields = ["country"]
