from django.apps import AppConfig


class ProfilesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.profiles'

    def ready(self):
        from apps.core.signals import connect

        from . import signals  # noqa: F401
        from .models import ProfilePhoto, SailorProfile

        connect(SailorProfile)
        connect(ProfilePhoto)
