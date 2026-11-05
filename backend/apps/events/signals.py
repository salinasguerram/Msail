from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import Event


@receiver(m2m_changed, sender=Event.boat_classes.through)
def refresh_search_text(sender, instance, action, **kwargs):
    """Las clases se guardan después del evento: al cambiarlas, se actualiza el texto de búsqueda."""
    if action in ("post_add", "post_remove", "post_clear") and isinstance(instance, Event):
        Event.objects.filter(pk=instance.pk).update(search_text=instance.build_search_text())


@receiver(post_save, sender="sailing.Club")
def refresh_club_events(sender, instance, **kwargs):
    """Si un club cambia de nombre, sus regatas se siguen encontrando por el nombre nuevo."""
    for event in instance.events.select_related("country", "region", "organizer_club"):
        Event.objects.filter(pk=event.pk).update(search_text=event.build_search_text())
