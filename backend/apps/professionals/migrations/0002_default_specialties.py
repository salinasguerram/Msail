from django.db import migrations

from apps.professionals.models import DEFAULT_SPECIALTIES


def create_specialties(apps, schema_editor):
    Specialty = apps.get_model("professionals", "Specialty")
    for order, (slug, name_es, name_en, icon) in enumerate(DEFAULT_SPECIALTIES):
        Specialty.objects.update_or_create(slug=slug, defaults={"name_es": name_es, "name_en": name_en, "icon": icon, "order": order})


class Migration(migrations.Migration):
    dependencies = [
        ("professionals", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_specialties, migrations.RunPython.noop),
    ]
