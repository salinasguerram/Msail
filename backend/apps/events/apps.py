from django.apps import AppConfig


class EventsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.events'

    def ready(self):
        from apps.core.signals import connect

        from . import signals  # noqa: F401
        from .models import Event, EventDocument, EventMedia

        connect(EventDocument)
        connect(EventMedia)
        connect(Event)
