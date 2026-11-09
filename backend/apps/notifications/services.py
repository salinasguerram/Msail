"""
Avisos a quienes siguen una regata: se guardan en la app y, si el usuario lo permite, se envían por email.

Cada aviso tiene una clave (ej. "results:12") para no repetirse: si los resultados se cargan
de nuevo o el comando de recordatorios corre dos veces, nadie recibe el mismo aviso otra vez.
"""

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.db import transaction
from django.utils import formats, translation
from django.utils.translation import gettext as _

from .models import Notification, NotificationKind

# Tipos que además se mandan por email (las fotos nuevas solo se avisan en la app).
EMAIL_KINDS = {NotificationKind.RESULTS, NotificationKind.DATES, NotificationKind.STARTS, NotificationKind.ENTRIES}


def _language(user):
    return "en" if (user.preferred_language or "").startswith("en") else "es"


def _texts(kind, event, date, article=None):
    """Título y texto del aviso en el idioma activo."""
    when = formats.date_format(date, "DATE_FORMAT") if date else ""
    name = event.name
    if kind == NotificationKind.RESULTS:
        return _("Resultados de %(event)s") % {"event": name}, _("Ya está publicada la clasificación.")
    if kind == NotificationKind.GALLERY:
        return _("Fotos nuevas de %(event)s") % {"event": name}, _("Se sumaron fotos y videos a la galería.")
    if kind == NotificationKind.DATES:
        return _("Cambió la fecha de %(event)s") % {"event": name}, _("Ahora empieza el %(date)s.") % {"date": when}
    if kind == NotificationKind.STARTS:
        place = ", ".join(p for p in [event.city, event.country.name] if p)
        return (
            _("%(event)s empieza mañana") % {"event": name},
            _("Largada el %(date)s en %(place)s.") % {"date": when, "place": place},
        )
    if kind == NotificationKind.ENTRIES:
        return (
            _("Cierran las inscripciones de %(event)s") % {"event": name},
            _("Podés inscribirte hasta el %(date)s.") % {"date": when},
        )
    if kind == NotificationKind.NEWS:
        return article.title, _("Nueva noticia sobre %(event)s.") % {"event": name}
    raise ValueError(kind)


def notify_followers(event, kind, key, date=None, article=None):
    """Crea el aviso para cada seguidor que todavía no lo tenga. Devuelve cuántos se crearon."""
    if not event.is_published:
        return 0
    followers = [f.user for f in event.follows.select_related("user").filter(user__is_active=True)]
    if not followers:
        return 0
    already = set(Notification.objects.filter(key=key, user__in=followers).values_list("user_id", flat=True))
    created = []
    for user in followers:
        if user.id in already:
            continue
        with translation.override(_language(user)):
            title, body = _texts(kind, event, date, article)
        created.append(
            Notification(user=user, kind=kind, title=title[:200], body=body[:300], event=event, article=article, key=key)
        )
    Notification.objects.bulk_create(created, ignore_conflicts=True)
    if kind in EMAIL_KINDS and created:
        user_ids = [n.user_id for n in created]
        transaction.on_commit(lambda: send_emails(key, user_ids))
    return len(created)


def send_emails(key, user_ids):
    """Manda por email los avisos pendientes de esa clave a quienes tienen el email verificado y los avisos activados."""
    pending = list(
        Notification.objects.filter(
            key=key, user_id__in=user_ids, emailed=False, user__email_notifications=True, user__email_verified=True
        ).select_related("user", "event")
    )
    if not pending:
        return 0
    messages = []
    for notification in pending:
        user = notification.user
        with translation.override(_language(user)):
            base = settings.FRONTEND_URL.rstrip("/")
            link = f"{base}/events/{notification.event.slug}" if notification.event else base
            body = "\n\n".join(
                [
                    notification.body,
                    _("Ver la regata: %(link)s") % {"link": link},
                    _(
                        "Te llega este email porque seguís esta regata en MSAIL LEAGUE. "
                        "Podés desactivar los avisos por email desde tu perfil."
                    ),
                ]
            )
        messages.append(EmailMessage(f"MSAIL LEAGUE · {notification.title}", body, settings.DEFAULT_FROM_EMAIL, [user.email]))
    get_connection(fail_silently=True).send_messages(messages)
    Notification.objects.filter(pk__in=[n.pk for n in pending]).update(emailed=True)
    return len(messages)
