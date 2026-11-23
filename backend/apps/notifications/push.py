"""
Notificaciones push en el celular, con el servicio de Expo (no hace falta cuenta propia de Firebase ni de Apple
para enviarlas: Expo las entrega con las credenciales que carga EAS al compilar la app).

Cada aviso de la app (regata que empieza, resultados, respuesta a un amarre...) también se manda como push a los
celulares en los que la persona inició sesión y dio permiso. Si Expo responde que un celular ya no está registrado
(desinstaló la app o sacó el permiso), se borra ese token.
"""

import logging

import requests
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification, NotificationKind, PushToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
BATCH = 100  # mensajes por pedido, el máximo de Expo


def link_for(notification):
    """Pantalla de la app que se abre al tocar el aviso."""
    if notification.article_id:
        return f"/news/{notification.article.slug}"
    if notification.event_id:
        return f"/events/{notification.event.slug}"
    if notification.kind == NotificationKind.BERTH:
        return "/marinas/requests"
    if notification.kind == NotificationKind.QUOTE:
        return "/professionals/quotes"
    return "/notifications"


def send(notifications):
    """Manda cada aviso como push a los celulares de su usuario. Devuelve cuántos mensajes se enviaron."""
    notifications = list(notifications)
    if not notifications:
        return 0
    tokens = {}
    for token in PushToken.objects.filter(user_id__in={n.user_id for n in notifications}):
        tokens.setdefault(token.user_id, []).append(token.token)
    messages = [
        {
            "to": token,
            "title": n.title,
            "body": n.body,
            "data": {"url": link_for(n)},
            "sound": "default",
            "channelId": "default",
        }
        for n in notifications
        for token in tokens.get(n.user_id, [])
    ]
    sent = 0
    for start in range(0, len(messages), BATCH):
        chunk = messages[start : start + BATCH]
        try:
            response = requests.post(EXPO_PUSH_URL, json=chunk, headers={"Accept": "application/json"}, timeout=10)
            tickets = response.json().get("data", []) if response.ok else []
        except (requests.RequestException, ValueError):
            logger.exception("No se pudieron mandar los avisos push")
            continue
        gone = [
            message["to"]
            for message, ticket in zip(chunk, tickets)
            if ticket.get("status") == "error" and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered"
        ]
        if gone:
            PushToken.objects.filter(token__in=gone).delete()
        sent += sum(1 for ticket in tickets if ticket.get("status") == "ok")
    return sent


def send_by_ids(ids):
    return send(Notification.objects.filter(pk__in=ids).select_related("event", "article"))


@receiver(post_save, sender=Notification, dispatch_uid="msail_push_on_notification")
def push_new_notification(sender, instance, created, **kwargs):
    # Los avisos creados de a uno (respuesta a un amarre o un presupuesto). Los de regatas se crean juntos y se
    # mandan desde services.notify_followers.
    if created:
        from django.db import transaction

        transaction.on_commit(lambda: send_by_ids([instance.pk]))
