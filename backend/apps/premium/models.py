"""
MSAIL Premium: membresías pagas que habilitan el contenido exclusivo (videos y lecciones marcados como Premium).

- Plan: lo que se ofrece en la app (precio, cada cuánto se cobra y qué incluye). Se edita desde el panel.
- Subscription: la membresía de un usuario. Se crea sola al pagar con Stripe, o a mano desde el panel
  (cortesía, canje, pago por transferencia...).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import get_language
from django.utils.translation import gettext_lazy as _

from apps.marinas.models import CURRENCIES


def _english():
    return (get_language() or "es").startswith("en")


class Interval(models.TextChoices):
    MONTH = "month", _("Mensual")
    YEAR = "year", _("Anual")


class Plan(models.Model):
    name_es = models.CharField(_("nombre (español)"), max_length=80, help_text=_("Ej: Premium mensual"))
    name_en = models.CharField(_("nombre (inglés)"), max_length=80, blank=True)
    price = models.DecimalField(_("precio"), max_digits=8, decimal_places=2)
    currency = models.CharField(_("moneda"), max_length=3, choices=CURRENCIES, default="USD")
    interval = models.CharField(_("se cobra"), max_length=10, choices=Interval.choices, default=Interval.MONTH)
    features_es = models.TextField(_("qué incluye (español)"), blank=True, help_text=_("Un beneficio por línea."))
    features_en = models.TextField(_("qué incluye (inglés)"), blank=True, help_text=_("Vacío: se muestra el español."))
    stripe_price_id = models.CharField(
        _("precio en Stripe"),
        max_length=80,
        blank=True,
        help_text=_("El ID del precio recurrente en Stripe (price_…). Sin esto el plan se muestra pero no se puede pagar."),
    )
    is_highlighted = models.BooleanField(_("destacado"), default=False, help_text=_("Se muestra como el recomendado."))
    is_active = models.BooleanField(_("activo"), default=True)
    order = models.PositiveSmallIntegerField(_("orden"), default=0)

    class Meta:
        verbose_name = _("plan")
        verbose_name_plural = _("planes")
        ordering = ["order", "price"]

    def __str__(self):
        return f"{self.name_es} · {self.price} {self.currency}"

    @property
    def name(self):
        return self.name_en if _english() and self.name_en else self.name_es

    @property
    def features(self):
        text = self.features_en if _english() and self.features_en.strip() else self.features_es
        return [line.strip(" -•\t") for line in text.splitlines() if line.strip(" -•\t")]

    @property
    def monthly_price(self):
        """Lo que aporta por mes (para los ingresos mensuales del panel)."""
        return self.price / 12 if self.interval == Interval.YEAR else self.price


class Status(models.TextChoices):
    ACTIVE = "active", _("Activa")
    PAST_DUE = "past_due", _("Pago pendiente")
    CANCELED = "canceled", _("Cancelada")
    EXPIRED = "expired", _("Vencida")


class Source(models.TextChoices):
    STRIPE = "stripe", _("Stripe")
    MANUAL = "manual", _("Manual (desde el panel)")


# Con el pago pendiente se mantiene el acceso unos días mientras Stripe reintenta el cobro.
ACCESS_STATUSES = [Status.ACTIVE, Status.PAST_DUE]


class SubscriptionQuerySet(models.QuerySet):
    def with_access(self, now=None):
        """Las que dan acceso hoy: activas (o con el pago pendiente) y sin vencer."""
        now = now or timezone.now()
        return self.filter(status__in=ACCESS_STATUSES).filter(Q(current_period_end__isnull=True) | Q(current_period_end__gt=now))


class Subscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name=_("usuario"), on_delete=models.CASCADE, related_name="subscriptions"
    )
    plan = models.ForeignKey(Plan, verbose_name=_("plan"), on_delete=models.SET_NULL, null=True, blank=True, related_name="subscriptions")
    status = models.CharField(_("estado"), max_length=10, choices=Status.choices, default=Status.ACTIVE)
    source = models.CharField(_("origen"), max_length=10, choices=Source.choices, default=Source.MANUAL)
    started_at = models.DateTimeField(_("desde"), default=timezone.now)
    current_period_end = models.DateTimeField(
        _("vence"), null=True, blank=True, help_text=_("Vacío: no vence (por ejemplo, una cortesía sin fecha).")
    )
    cancel_at_period_end = models.BooleanField(_("se cancela al vencer"), default=False)
    canceled_at = models.DateTimeField(_("cancelada el"), null=True, blank=True)
    stripe_customer_id = models.CharField(_("cliente en Stripe"), max_length=80, blank=True)
    stripe_subscription_id = models.CharField(_("suscripción en Stripe"), max_length=80, blank=True, db_index=True)
    notes = models.TextField(_("notas internas"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = SubscriptionQuerySet.as_manager()

    class Meta:
        verbose_name = _("suscripción")
        verbose_name_plural = _("suscripciones")
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.user} · {self.get_status_display()}"

    @property
    def has_access(self):
        return self.status in ACCESS_STATUSES and (self.current_period_end is None or self.current_period_end > timezone.now())


def active_subscription(user):
    if not user or not user.is_authenticated:
        return None
    return Subscription.objects.with_access().filter(user=user).select_related("plan").order_by("-current_period_end").first()


def is_premium(user):
    return active_subscription(user) is not None


def can_see_premium(user):
    """Contenido Premium: lo ven los suscriptores y el equipo de MSAIL (para revisarlo)."""
    return bool(user and user.is_authenticated and (user.is_staff or is_premium(user)))
