"""Borra del almacenamiento los archivos (fotos, PDFs) que ya no se usan."""

from django.db.models import FileField
from django.db.models.signals import post_delete, pre_save


def _file_fields(instance):
    # ImageField es un tipo de FileField: cubre fotos y documentos.
    return [f for f in instance._meta.get_fields() if isinstance(f, FileField)]


def delete_files_on_delete(sender, instance, **kwargs):
    for field in _file_fields(instance):
        file = getattr(instance, field.name)
        if file:
            file.storage.delete(file.name)


def delete_replaced_files(sender, instance, **kwargs):
    if not instance.pk:
        return
    previous = sender.objects.filter(pk=instance.pk).first()
    if not previous:
        return
    for field in _file_fields(instance):
        old, new = getattr(previous, field.name), getattr(instance, field.name)
        if old and old.name != (new.name if new else None):
            old.storage.delete(old.name)


def connect(model):
    post_delete.connect(delete_files_on_delete, sender=model, dispatch_uid=f"del_files_{model._meta.label}")
    pre_save.connect(delete_replaced_files, sender=model, dispatch_uid=f"replace_files_{model._meta.label}")
