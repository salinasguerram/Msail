"""
Cobro de las membresías con Stripe (Checkout + portal del cliente + webhooks), con la API HTTP de Stripe.

Variables de entorno:
- STRIPE_SECRET_KEY: la clave secreta (sk_test_… para probar, sk_live_… en producción).
- STRIPE_WEBHOOK_SECRET: la del webhook (whsec_…), para verificar que los avisos vienen de Stripe.
Sin STRIPE_SECRET_KEY los planes se ven en la app pero el botón de pagar avisa que todavía no está habilitado.
"""

import hashlib
import hmac
import json
import time
from datetime import datetime, timezone

import requests
from django.conf import settings
from django.contrib.auth import get_user_model

from .models import Plan, Source, Status, Subscription

API = "https://api.stripe.com/v1"
TOLERANCE_SECONDS = 300  # un aviso más viejo que esto se descarta (evita que se reenvíe uno capturado)

# Estados de Stripe → los de MSAIL
STATUS_MAP = {
    "active": Status.ACTIVE,
    "trialing": Status.ACTIVE,
    "past_due": Status.PAST_DUE,
    "unpaid": Status.PAST_DUE,
    "canceled": Status.CANCELED,
    "incomplete_expired": Status.EXPIRED,
}


class StripeError(Exception):
    pass


def enabled():
    return bool(settings.STRIPE_SECRET_KEY)


def _call(method, path, data=None):
    try:
        response = requests.request(method, f"{API}{path}", data=data, auth=(settings.STRIPE_SECRET_KEY, ""), timeout=15)
    except requests.RequestException as exc:
        raise StripeError(str(exc)) from exc
    body = response.json() if response.content else {}
    if response.status_code >= 400:
        raise StripeError(body.get("error", {}).get("message", f"Stripe {response.status_code}"))
    return body


def create_checkout(user, plan, success_url, cancel_url):
    """Página de pago de Stripe para ese plan. Devuelve la URL a la que hay que mandar al usuario."""
    data = {
        "mode": "subscription",
        "line_items[0][price]": plan.stripe_price_id,
        "line_items[0][quantity]": 1,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": str(user.pk),
        "metadata[user_id]": str(user.pk),
        "metadata[plan_id]": str(plan.pk),
        "subscription_data[metadata][user_id]": str(user.pk),
        "subscription_data[metadata][plan_id]": str(plan.pk),
        "allow_promotion_codes": "true",
    }
    customer = Subscription.objects.filter(user=user).exclude(stripe_customer_id="").values_list("stripe_customer_id", flat=True).first()
    if customer:
        data["customer"] = customer
    else:
        data["customer_email"] = user.email
    return _call("POST", "/checkout/sessions", data)["url"]


def create_portal(customer_id, return_url):
    """Portal de Stripe donde el usuario cambia la tarjeta, ve sus facturas o cancela."""
    return _call("POST", "/billing_portal/sessions", {"customer": customer_id, "return_url": return_url})["url"]


def verify_signature(payload: bytes, header: str, secret: str, now=None):
    """Comprueba la firma Stripe-Signature (t=…,v1=…). Lanza StripeError si no es válida."""
    parts = {}
    for item in (header or "").split(","):
        key, _, value = item.partition("=")
        parts.setdefault(key.strip(), []).append(value.strip())
    try:
        timestamp = int(parts["t"][0])
    except (KeyError, ValueError) as exc:
        raise StripeError("Firma sin fecha") from exc
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, sig) for sig in parts.get("v1", [])):
        raise StripeError("Firma inválida")
    if abs((now or time.time()) - timestamp) > TOLERANCE_SECONDS:
        raise StripeError("Aviso vencido")
    return json.loads(payload)


def _when(seconds):
    return datetime.fromtimestamp(seconds, tz=timezone.utc) if seconds else None


def _period_end(data):
    # Desde 2025 Stripe informa el fin del período en cada ítem; antes, en la suscripción.
    end = data.get("current_period_end")
    if not end:
        items = (data.get("items") or {}).get("data") or []
        end = items[0].get("current_period_end") if items else None
    return _when(end)


def sync_subscription(data):
    """Crea o actualiza la suscripción de MSAIL a partir de un objeto `subscription` de Stripe."""
    metadata = data.get("metadata") or {}
    subscription = Subscription.objects.filter(stripe_subscription_id=data["id"]).first()
    if subscription is None:
        user = get_user_model().objects.filter(pk=metadata.get("user_id")).first()
        if user is None:
            return None
        subscription = Subscription(user=user, source=Source.STRIPE, stripe_subscription_id=data["id"])
        subscription.started_at = _when(data.get("start_date")) or subscription.started_at
    plan_id = metadata.get("plan_id")
    if plan_id and (plan := Plan.objects.filter(pk=plan_id).first()):
        subscription.plan = plan
    subscription.stripe_customer_id = data.get("customer") or subscription.stripe_customer_id
    subscription.status = STATUS_MAP.get(data.get("status"), subscription.status)
    subscription.current_period_end = _period_end(data) or subscription.current_period_end
    subscription.cancel_at_period_end = bool(data.get("cancel_at_period_end"))
    subscription.canceled_at = _when(data.get("canceled_at"))
    subscription.save()
    return subscription


def handle_event(event):
    """Procesa un aviso de Stripe. Devuelve la suscripción tocada (o None si el aviso no nos interesa)."""
    kind = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    if kind.startswith("customer.subscription."):
        return sync_subscription(obj)
    if kind == "checkout.session.completed" and obj.get("subscription"):
        # Trae la suscripción completa (con el vencimiento) apenas se paga, sin esperar el otro aviso.
        return sync_subscription(_call("GET", f"/subscriptions/{obj['subscription']}"))
    return None
