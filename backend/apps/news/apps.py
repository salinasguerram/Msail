from django.apps import AppConfig


class NewsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.news"
    verbose_name = "Noticias"

    def ready(self):
        from apps.core.signals import connect

        from . import signals  # noqa: F401
        from .models import Article

        connect(Article)
