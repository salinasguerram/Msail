from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    verbose_name = "Avisos"

    def ready(self):
        from . import push  # noqa: F401  (conecta el envío push de los avisos nuevos)
