from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import SailorProfile


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_sailor_profile(sender, instance, created, **kwargs):
    if created:
        SailorProfile.objects.get_or_create(user=instance)
