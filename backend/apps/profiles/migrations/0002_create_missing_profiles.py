from django.conf import settings
from django.db import migrations


def create_missing_profiles(apps, schema_editor):
    """Los usuarios creados antes de esta migración no tienen perfil todavía."""
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    SailorProfile = apps.get_model("profiles", "SailorProfile")
    missing = User.objects.filter(sailor_profile__isnull=True)
    SailorProfile.objects.bulk_create([SailorProfile(user=user) for user in missing])


class Migration(migrations.Migration):
    dependencies = [
        ("profiles", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_missing_profiles, migrations.RunPython.noop),
    ]
