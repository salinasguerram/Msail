import csv

from django.contrib import admin
from django.http import HttpResponse
from django.utils import timezone

from .dashboard import build_dashboard


class MsailAdminSite(admin.AdminSite):
    site_header = "MSAIL LEAGUE · Administración"
    site_title = "MSAIL LEAGUE"
    index_title = "Panel de administración"

    def index(self, request, extra_context=None):
        extra_context = {**(extra_context or {}), "dashboard": build_dashboard()}
        return super().index(request, extra_context)


@admin.action(description="Exportar seleccionados a CSV")
def export_as_csv(modeladmin, request, queryset):
    """Disponible en todas las listas del panel. Exporta las columnas visibles de la lista."""
    opts = modeladmin.model._meta
    fields = [f for f in modeladmin.get_list_display(request) if f != "action_checkbox"]

    response = HttpResponse(content_type="text/csv; charset=utf-8")
    filename = f"{opts.model_name}-{timezone.localdate():%Y%m%d}.csv"
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.write("﻿")  # BOM para que Excel abra bien los acentos

    writer = csv.writer(response)
    writer.writerow([label_for(modeladmin, name) for name in fields])
    for obj in queryset:
        writer.writerow([value_for(modeladmin, obj, name) for name in fields])
    return response


def label_for(modeladmin, name):
    attr = getattr(modeladmin, name, None)
    if attr is not None and hasattr(attr, "short_description"):
        return str(attr.short_description)
    try:
        return str(modeladmin.model._meta.get_field(name).verbose_name)
    except Exception:
        return name if name != "__str__" else str(modeladmin.model._meta.verbose_name)


def value_for(modeladmin, obj, name):
    if name == "__str__":
        return str(obj)
    attr = getattr(modeladmin, name, None)
    value = attr(obj) if callable(attr) else getattr(obj, name, "")
    if callable(value):
        value = value()
    if isinstance(value, bool):
        return "Sí" if value else "No"
    return "" if value is None else str(value)
