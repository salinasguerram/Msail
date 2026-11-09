from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from .models import Article


@receiver(m2m_changed, sender=Article.boat_classes.through)
def refresh_search_text(sender, instance, action, **kwargs):
    """Las clases se guardan después de la noticia: al cambiarlas, se actualiza el texto de búsqueda."""
    if action in ("post_add", "post_remove", "post_clear") and isinstance(instance, Article):
        Article.objects.filter(pk=instance.pk).update(search_text=instance.build_search_text())
