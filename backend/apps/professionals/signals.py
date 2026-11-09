from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from .models import Professional


@receiver(m2m_changed, sender=Professional.specialties.through)
def refresh_search_text(sender, instance, action, **kwargs):
    """Las especialidades se guardan después del profesional: al cambiarlas, se actualiza el texto de búsqueda."""
    if action in ("post_add", "post_remove", "post_clear") and isinstance(instance, Professional):
        Professional.objects.filter(pk=instance.pk).update(search_text=instance.build_search_text())
