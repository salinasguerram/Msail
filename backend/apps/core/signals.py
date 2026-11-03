"""Borra del almacenamiento los archivos de fotos que ya no se usan."""

from django.db.models import ImageField
from django.db.models.signals import post_delete, pre_save


def _image_fields(instance):
    return [f for f in instance._meta.get_fields() if isinstance(f, ImageField)]


def delete_files_on_delete(sender, instance, **kwargs):
    for field in _image_fields(instance):
        file = getattr(instance, field.name)
        if file:
            file.storage.delete(file.name)


def delete_replaced_files(sender, instance, **kwargs):
    if not instance.pk:
        return
    previous = sender.objects.filter(pk=instance.pk).first()
    if not previous:
        return
    for field in _image_fields(instance):
        old, new = getattr(previous, field.name), getattr(instance, field.name)
        if old and old.name != (new.name if new else None):
            old.storage.delete(old.name)


def connect(model):
    post_delete.connect(delete_files_on_delete, sender=model, dispatch_uid=f"del_files_{model._meta.label}")
    pre_save.connect(delete_replaced_files, sender=model, dispatch_uid=f"replace_files_{model._meta.label}")
