from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import Article


@receiver(m2m_changed, sender=Article.boat_classes.through)
def refresh_search_text(sender, instance, action, **kwargs):
    """Las clases se guardan después de la noticia: al cambiarlas, se actualiza el texto de búsqueda."""
    if action in ("post_add", "post_remove", "post_clear") and isinstance(instance, Article):
        Article.objects.filter(pk=instance.pk).update(search_text=instance.build_search_text())


def notify_event_followers(article):
    """Si la noticia ya es visible y tiene regata, avisa una vez a quienes siguen esa regata (solo en la app)."""
    from apps.notifications.models import NotificationKind
    from apps.notifications.services import notify_followers

    if article.followers_notified or not article.event_id or not article.is_visible:
        return 0
    sent = notify_followers(article.event, NotificationKind.NEWS, f"news:{article.pk}", article=article)
    Article.objects.filter(pk=article.pk).update(followers_notified=True)
    article.followers_notified = True
    return sent


@receiver(post_save, sender=Article)
def article_saved(sender, instance, **kwargs):
    notify_event_followers(instance)
