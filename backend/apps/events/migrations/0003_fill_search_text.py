from django.db import migrations

from apps.core.text import normalize


def fill_search_text(apps, schema_editor):
    """Arma el texto de búsqueda de las regatas que ya existían antes del buscador."""
    Event = apps.get_model("events", "Event")
    for event in Event.objects.select_related("country", "region", "organizer_club").prefetch_related("boat_classes"):
        parts = [event.name, event.city, event.venue, event.organizer_name]
        if event.organizer_club_id:
            parts.append(event.organizer_club.name)
        parts += [event.country.name_es, event.country.name_en, event.country.iso_code]
        if event.region_id:
            parts += [event.region.name_es, event.region.name_en]
        parts += [c.name for c in event.boat_classes.all()]
        event.search_text = normalize(" ".join(p for p in parts if p))
        event.save(update_fields=["search_text"])


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0002_event_search_text"),
    ]

    operations = [
        migrations.RunPython(fill_search_text, migrations.RunPython.noop),
    ]
