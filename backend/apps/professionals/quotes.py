"""
Emails y avisos de los pedidos de presupuesto.

- Al crearse: si el profesional tiene email, le llega el pedido (con "responder a" el navegante) y queda como
  "enviado"; si no, queda pendiente para que lo reenvíe el equipo (aviso a QUOTE_REQUESTS_EMAIL si está configurado).
  El navegante recibe una confirmación.
- Al responderse desde el panel: aviso en la app y email al navegante.
"""

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.db import transaction
from django.utils import translation
from django.utils.translation import gettext as _

from apps.notifications.models import Notification, NotificationKind

from .models import QuoteStatus


def _language(user):
    return "en" if (user.preferred_language or "").startswith("en") else "es"


def _link():
    return f"{settings.FRONTEND_URL.rstrip('/')}/professionals/quotes"


def _send(messages):
    if messages:
        get_connection(fail_silently=True).send_messages(messages)


def _summary(quote):
    lines = [
        f"Navegante: {quote.contact_name} · {quote.contact_email} · {quote.contact_phone or 'sin teléfono'}",
        f"Barco: {quote.boat_description or 'sin datos'}",
        f"Dónde: {quote.location or 'sin datos'}",
        f"Para cuándo: {quote.needed_by:%d/%m/%Y}" if quote.needed_by else "Para cuándo: sin fecha",
    ]
    if quote.specialty_id:
        lines.insert(1, f"Servicio: {quote.specialty.name_es}")
    return "\n".join(lines) + f"\n\n{quote.details}"


def quote_created(quote):
    """Se llama al crear el pedido. Devuelve el estado inicial (enviado si el profesional tiene email)."""
    professional = quote.professional
    if professional.email:
        quote.status = QuoteStatus.SENT
        quote.save(update_fields=["status"])
    transaction.on_commit(lambda: _send_created(quote))
    return quote.status


def _send_created(quote):
    professional = quote.professional
    messages = []
    if professional.email:
        body = (
            f"Hola {professional.name}:\n\n"
            "Un navegante te pidió presupuesto a través de MSAIL LEAGUE. Para responderle, contestá este email.\n\n"
            f"{_summary(quote)}"
        )
        messages.append(
            EmailMessage(
                f"Pedido de presupuesto de {quote.contact_name} · MSAIL LEAGUE",
                body,
                settings.DEFAULT_FROM_EMAIL,
                [professional.email],
                reply_to=[quote.contact_email],
            )
        )
    team = settings.QUOTE_REQUESTS_EMAIL
    if team:
        state = "Se envió al profesional por email." if professional.email else "El profesional no tiene email: hay que reenviarlo."
        messages.append(
            EmailMessage(
                f"Nuevo pedido de presupuesto · {professional.name}",
                f"{state}\n\n{_summary(quote)}\n\nPanel: /admin/professionals/quoterequest/{quote.pk}/change/",
                settings.DEFAULT_FROM_EMAIL,
                [team],
                reply_to=[quote.contact_email],
            )
        )
    with translation.override(_language(quote.user)):
        body = "\n\n".join(
            [
                _("Recibimos tu pedido de presupuesto para %(professional)s.") % {"professional": professional.name},
                _("Se lo enviamos al profesional, que te va a responder a este email.")
                if professional.email
                else _("El equipo de MSAIL se lo hace llegar al profesional y te avisamos cuando responda."),
                _("Seguí tus pedidos: %(link)s") % {"link": _link()},
            ]
        )
        subject = _("Pedido de presupuesto a %(professional)s") % {"professional": professional.name}
    messages.append(EmailMessage(f"MSAIL LEAGUE · {subject}", body, settings.DEFAULT_FROM_EMAIL, [quote.contact_email]))
    _send(messages)


def notify_quote_response(quote):
    """Aviso en la app y email al navegante cuando el equipo carga la respuesta o cambia el estado."""
    with translation.override(_language(quote.user)):
        title = _("Novedades de tu pedido a %(professional)s") % {"professional": quote.professional.name}
        body = quote.response or _("Cambió el estado de tu pedido de presupuesto.")
        email_body = "\n\n".join([body, _("Seguí tus pedidos: %(link)s") % {"link": _link()}])
    key = f"quote:{quote.pk}:{quote.status}:{quote.responded_at.timestamp() if quote.responded_at else 0}"
    Notification.objects.get_or_create(
        user=quote.user, key=key, defaults={"kind": NotificationKind.QUOTE, "title": title[:200], "body": body[:300]}
    )
    transaction.on_commit(
        lambda: _send([EmailMessage(f"MSAIL LEAGUE · {title}", email_body, settings.DEFAULT_FROM_EMAIL, [quote.contact_email])])
    )
