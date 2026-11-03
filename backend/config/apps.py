from django.contrib.admin.apps import AdminConfig


class MsailAdminConfig(AdminConfig):
    """Reemplaza el admin de Django por el panel de MSAIL (métricas en la portada, export a CSV)."""

    default_site = "config.admin_site.MsailAdminSite"

    def ready(self):
        super().ready()
        from django.contrib import admin

        from .admin_site import export_as_csv

        admin.site.add_action(export_as_csv)
