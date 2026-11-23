"""
Tareas programadas. En Vercel no hay un servidor prendido para correr un cron: Vercel llama a estas URLs según el
horario de vercel.json ("crons") y manda «Authorization: Bearer <CRON_SECRET>». Sin ese secreto no se corre nada.
"""

import hmac
from io import StringIO

from django.conf import settings
from django.core.management import call_command
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_GET


def _authorized(request):
    secret = settings.CRON_SECRET
    given = request.headers.get("Authorization", "")
    return bool(secret) and hmac.compare_digest(given, f"Bearer {secret}")


@require_GET
def event_reminders(request):
    """Recordatorios de regatas (empieza mañana, cierran inscripciones, noticias programadas). Una vez por día."""
    if not _authorized(request):
        return HttpResponse(status=401)
    out = StringIO()
    call_command("send_event_reminders", stdout=out)
    return JsonResponse({"ok": True, "result": out.getvalue().strip()})
