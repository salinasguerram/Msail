import logging
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.utils.translation import gettext as _
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import stripe
from .models import Plan, Subscription, active_subscription
from .serializers import PlanSerializer, SubscriptionSerializer

logger = logging.getLogger(__name__)


def _context(request):
    return {"request": request, "payments": stripe.enabled()}


def _app_url(path, **params):
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}" + (f"?{urlencode(params)}" if params else "")


class PremiumView(APIView):
    """Planes de MSAIL Premium y, si hay sesión, la membresía del usuario."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        context = _context(request)
        subscription = active_subscription(request.user)
        return Response(
            {
                "plans": PlanSerializer(Plan.objects.filter(is_active=True), many=True, context=context).data,
                "is_premium": subscription is not None,
                "subscription": SubscriptionSerializer(subscription, context=context).data if subscription else None,
                "payments_enabled": stripe.enabled(),
            }
        )


class CheckoutView(APIView):
    """Empieza el pago de un plan: devuelve la página de Stripe a la que hay que ir."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkout"

    def post(self, request):
        plan = Plan.objects.filter(pk=request.data.get("plan"), is_active=True).first()
        if plan is None:
            return Response({"detail": _("Ese plan no existe.")}, status=status.HTTP_404_NOT_FOUND)
        if not stripe.enabled() or not plan.stripe_price_id:
            return Response({"detail": _("Los pagos todavía no están habilitados.")}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if active_subscription(request.user):
            return Response({"detail": _("Ya tenés MSAIL Premium.")}, status=status.HTTP_409_CONFLICT)
        try:
            url = stripe.create_checkout(
                request.user, plan, success_url=_app_url("/premium", checkout="success"), cancel_url=_app_url("/premium")
            )
        except stripe.StripeError:
            logger.exception("No se pudo crear el pago en Stripe")
            return Response({"detail": _("No se pudo iniciar el pago. Probá de nuevo.")}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({"url": url})


class PortalView(APIView):
    """Portal de Stripe para cambiar la tarjeta, ver facturas o cancelar."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkout"

    def post(self, request):
        customer = (
            Subscription.objects.filter(user=request.user).exclude(stripe_customer_id="").values_list("stripe_customer_id", flat=True).first()
        )
        if not customer or not stripe.enabled():
            return Response({"detail": _("Tu membresía la administra el equipo de MSAIL.")}, status=status.HTTP_404_NOT_FOUND)
        try:
            return Response({"url": stripe.create_portal(customer, _app_url("/premium"))})
        except stripe.StripeError:
            logger.exception("No se pudo abrir el portal de Stripe")
            return Response({"detail": _("No se pudo abrir. Probá de nuevo.")}, status=status.HTTP_502_BAD_GATEWAY)


class StripeWebhookView(APIView):
    """Avisos de Stripe (pagos, renovaciones, cancelaciones). Se verifica la firma antes de tocar nada."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        if not settings.STRIPE_WEBHOOK_SECRET:
            return Response(status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            event = stripe.verify_signature(request.body, request.headers.get("Stripe-Signature", ""), settings.STRIPE_WEBHOOK_SECRET)
        except (stripe.StripeError, ValueError):
            return Response(status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                stripe.handle_event(event)
        except stripe.StripeError:
            logger.exception("Falló un aviso de Stripe")
            return Response(status=status.HTTP_502_BAD_GATEWAY)  # Stripe lo reintenta
        return Response({"received": True})
