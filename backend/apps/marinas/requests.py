"""
Emails y avisos de las solicitudes de amarre.

- Al crearse: confirmación al navegante y aviso al equipo (MARINA_REQUESTS_EMAIL, si está configurado).
- Al responderse desde el panel: aviso en la app y email al navegante con la respuesta.
"""

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.db import transaction
from django.utils import formats, translation
from django.utils.translation import gettext as _

from apps.notifications.models import Notification, NotificationKind

from .models import RequestStatus


def _language(user):
    return "en" if (user.preferred_language or "").startswith("en") else "es"


def _dates(request):
    return _("del %(arrival)s al %(departure)s") % {
        "arrival": formats.date_format(request.arrival, "SHORT_DATE_FORMAT"),
        "departure": formats.date_format(request.departure, "SHORT_DATE_FORMAT"),
    }


def _link():
    return f"{settings.FRONTEND_URL.rstrip('/')}/marinas/requests"


def _send(messages):
    if messages:
        get_connection(fail_silently=True).send_messages(messages)


def request_created(request):
    """Se llama al crear la solicitud (los emails salen cuando se confirma la transacción)."""
    transaction.on_commit(lambda: _send_created(request))


def _send_created(request):
    messages = []
    with translation.override(_language(request.user)):
        body = "\n\n".join(
            [
                _("Recibimos tu solicitud de amarre en %(marina)s para %(boat)s, %(dates)s.")
                % {"marina": request.marina.name, "boat": request.boat_name, "dates": _dates(request)},
                _("El equipo de MSAIL la gestiona con la marina y te avisamos apenas haya respuesta."),
                _("Seguí el estado de tus solicitudes: %(link)s") % {"link": _link()},
            ]
        )
        subject = _("Solicitud de amarre en %(marina)s") % {"marina": request.marina.name}
    messages.append(EmailMessage(f"MSAIL LEAGUE · {subject}", body, settings.DEFAULT_FROM_EMAIL, [request.contact_email]))

    if settings.MARINA_REQUESTS_EMAIL:
        admin_url = f"/admin/marinas/berthrequest/{request.pk}/change/"
        team_body = "\n".join(
            [
                f"Marina: {request.marina.name} ({request.marina.city})",
                f"Barco: {request.boat_name} · {request.length_m} m de eslora",
                f"Fechas: {request.arrival:%d/%m/%Y} → {request.departure:%d/%m/%Y} ({request.nights} noches)",
                f"Contacto: {request.contact_name} · {request.contact_email} · {request.contact_phone or 'sin teléfono'}",
                "",
                request.message or "(sin mensaje)",
                "",
                f"Gestionala en el panel: {admin_url}",
            ]
        )
        messages.append(
            EmailMessage(
                f"Nueva solicitud de amarre · {request.marina.name}",
                team_body,
                settings.DEFAULT_FROM_EMAIL,
                [settings.MARINA_REQUESTS_EMAIL],
                reply_to=[request.contact_email],
            )
        )
    _send(messages)


STATUS_TITLES = {
    RequestStatus.ACCEPTED: "Aceptaron tu solicitud de amarre en %(marina)s",
    RequestStatus.REJECTED: "No hay lugar en %(marina)s para tu solicitud",
    RequestStatus.PENDING: "Novedades de tu solicitud de amarre en %(marina)s",
}


def notify_response(request):
    """Aviso en la app y email al navegante cuando el equipo responde o cambia el estado."""
    user = request.user
    with translation.override(_language(user)):
        template = STATUS_TITLES.get(request.status, STATUS_TITLES[RequestStatus.PENDING])
        title = _(template) % {"marina": request.marina.name}
        body = request.response or _dates(request)
        email_body = "\n\n".join(
            [
                f"{request.boat_name} · {_dates(request)}",
                request.response or "",
                _("Seguí el estado de tus solicitudes: %(link)s") % {"link": _link()},
            ]
        )
    key = f"berth:{request.pk}:{request.status}:{request.responded_at.timestamp() if request.responded_at else 0}"
    Notification.objects.get_or_create(
        user=user, key=key, defaults={"kind": NotificationKind.BERTH, "title": title[:200], "body": body[:300]}
    )
    transaction.on_commit(
        lambda: _send([EmailMessage(f"MSAIL LEAGUE · {title}", email_body, settings.DEFAULT_FROM_EMAIL, [request.contact_email])])
    )
