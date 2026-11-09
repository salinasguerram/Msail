from django.db.models.signals import m2m_changed, post_save, pre_save
from django.dispatch import receiver

from django.utils import timezone

from apps.notifications.models import NotificationKind
from apps.notifications.services import notify_followers

from .models import Event, EventMedia, EventResult


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


# ---------- Avisos a quienes siguen la regata


@receiver(post_save, sender=EventResult)
def results_published(sender, instance, created, **kwargs):
    """Primer resultado cargado (a mano o importado): se avisa una sola vez."""
    if created:
        notify_followers(instance.event, NotificationKind.RESULTS, f"results:{instance.event_id}")


@receiver(post_save, sender=EventMedia)
def gallery_updated(sender, instance, created, **kwargs):
    """Fotos o videos nuevos: como mucho un aviso por día por regata."""
    if created:
        notify_followers(instance.event, NotificationKind.GALLERY, f"gallery:{instance.event_id}:{timezone.localdate()}")


@receiver(pre_save, sender=Event)
def remember_dates(sender, instance, **kwargs):
    previous = sender.objects.filter(pk=instance.pk).values("start_date").first() if instance.pk else None
    instance._previous_start = previous["start_date"] if previous else None


@receiver(post_save, sender=Event)
def dates_changed(sender, instance, created, **kwargs):
    """Si cambia la largada de una regata que todavía no terminó, se avisa a sus seguidores."""
    previous = getattr(instance, "_previous_start", None)
    if created or previous is None or previous == instance.start_date:
        return
    if instance.last_day < timezone.localdate():
        return
    notify_followers(instance, NotificationKind.DATES, f"dates:{instance.pk}:{instance.start_date}", date=instance.start_date)
