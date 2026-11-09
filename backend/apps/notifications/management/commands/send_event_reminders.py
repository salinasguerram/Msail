"""
Recordatorios diarios para quienes siguen regatas.

Uso: python manage.py send_event_reminders
Se programa una vez por día (en el servidor, con cron o el programador de tareas del hosting).
Se puede correr varias veces: cada recordatorio se manda una sola vez.

- "Empieza mañana": regatas que largan al día siguiente.
- "Cierran las inscripciones": regatas con la inscripción abierta que cierra dentro de los próximos 3 días.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.events.models import Event
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify_followers

ENTRIES_NOTICE_DAYS = 3


class Command(BaseCommand):
    help = "Avisa a los seguidores de las regatas que empiezan mañana o cuya inscripción está por cerrar."

    def handle(self, *args, **options):
        today = timezone.localdate()
        followed = Event.objects.filter(is_published=True, follows__isnull=False).distinct().select_related("country")

        starts = 0
        for event in followed.filter(start_date=today + timedelta(days=1)):
            starts += notify_followers(event, NotificationKind.STARTS, f"starts:{event.pk}:{event.start_date}", date=event.start_date)

        entries = 0
        limit = today + timedelta(days=ENTRIES_NOTICE_DAYS)
        closing = followed.exclude(entry_url="").filter(start_date__gt=today).filter(
            Q(entry_deadline__range=(today, limit)) | Q(entry_deadline__isnull=True, start_date__lte=limit)
        )
        for event in closing:
            deadline = event.entry_deadline or event.start_date
            entries += notify_followers(event, NotificationKind.ENTRIES, f"entries:{event.pk}:{deadline}", date=deadline)

        self.stdout.write(self.style.SUCCESS(f"Recordatorios: {starts} de largada, {entries} de inscripción."))
