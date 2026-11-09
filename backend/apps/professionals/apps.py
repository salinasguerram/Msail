from django.apps import AppConfig


class ProfessionalsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.professionals"
    verbose_name = "Profesionales"

    def ready(self):
        from apps.core.signals import connect

        from . import signals  # noqa: F401
        from .models import Professional, ProfessionalPhoto

        connect(Professional)
        connect(ProfessionalPhoto)
