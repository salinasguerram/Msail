from django.apps import AppConfig


class MsailingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.msailing"
    verbose_name = "MSailing"

    def ready(self):
        from apps.core.signals import connect

        from .models import FoundationSupport, Section

        connect(Section)
        connect(FoundationSupport)
