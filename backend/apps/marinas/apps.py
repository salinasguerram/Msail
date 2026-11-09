from django.apps import AppConfig


class MarinasConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.marinas"
    verbose_name = "Marinas"

    def ready(self):
        from apps.core.signals import connect

        from .models import MarinaPhoto

        connect(MarinaPhoto)
