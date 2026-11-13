import csv

from django.contrib import admin
from django.core.exceptions import ValidationError
from django.http import HttpResponse
from django.utils import timezone
from unfold.forms import AuthenticationForm
from unfold.sites import UnfoldAdminSite

from .dashboard import build_dashboard

EMAIL_NOT_VERIFIED = "Tu cuenta tiene que tener el email verificado para entrar al panel."


class MsailLoginForm(AuthenticationForm):
    """Login del panel: además de ser staff, la cuenta tiene que tener el email verificado."""

    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        if user.is_staff and not user.email_verified:
            raise ValidationError(EMAIL_NOT_VERIFIED, code="email_not_verified")


class MsailAdminSite(UnfoldAdminSite):
    # Mismo nombre que el logo de la app.
    site_header = "MSAIL"
    site_title = "MSAIL"
    index_title = "Perfil de administrador"
    login_form = MsailLoginForm

    def has_permission(self, request):
        # También corta el acceso a quien tenía la sesión abierta y perdió la verificación.
        return super().has_permission(request) and getattr(request.user, "email_verified", False)

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
