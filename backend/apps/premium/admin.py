from datetime import timedelta

from django.contrib import admin, messages
from django.utils import timezone
from unfold.admin import ModelAdmin
from unfold.decorators import action, display

from .models import Plan, Status, Subscription


@admin.register(Plan)
class PlanAdmin(ModelAdmin):
    list_display = ["name_es", "price", "currency", "interval", "is_highlighted", "is_active", "subscribers", "order"]
    list_editable = ["is_active", "order"]
    fieldsets = (
        (None, {"fields": ("name_es", "name_en", "price", "currency", "interval", "is_highlighted", "is_active", "order")}),
        ("Qué incluye", {"fields": ("features_es", "features_en")}),
        (
            "Cobro",
            {
                "fields": ("stripe_price_id",),
                "description": "Creá el producto con un precio recurrente en Stripe y pegá acá su ID (price_…). "
                "El precio de arriba es el que se muestra: tiene que coincidir con el de Stripe.",
            },
        ),
    )

    @display(description="suscriptores activos")
    def subscribers(self, plan):
        return plan.subscriptions.with_access().count()


@admin.register(Subscription)
class SubscriptionAdmin(ModelAdmin):
    list_display = ["user", "plan", "status_badge", "source", "started_at", "current_period_end", "cancel_at_period_end"]
    list_filter = ["status", "source", "plan", "cancel_at_period_end"]
    search_fields = ["user__email", "user__first_name", "user__last_name", "stripe_customer_id", "stripe_subscription_id"]
    autocomplete_fields = ["user"]
    date_hierarchy = "started_at"
    readonly_fields = ["stripe_customer_id", "stripe_subscription_id", "created_at", "updated_at"]
    actions = ["extend_month", "extend_year", "cancel_now"]
    fieldsets = (
        (None, {"fields": ("user", "plan", "status", "source", "started_at", "current_period_end", "cancel_at_period_end", "canceled_at")}),
        ("Notas", {"fields": ("notes",)}),
        (
            "Stripe",
            {
                "fields": ("stripe_customer_id", "stripe_subscription_id", "created_at", "updated_at"),
                "description": "Las que vienen de Stripe se actualizan solas con cada cobro o cancelación. "
                "Para dar una membresía de cortesía, creala acá con origen «Manual».",
            },
        ),
    )

    @display(
        description="estado",
        label={"Activa": "success", "Pago pendiente": "warning", "Cancelada": "danger", "Vencida": "info"},
    )
    def status_badge(self, subscription):
        return subscription.get_status_display()

    def _extend(self, request, queryset, days):
        now = timezone.now()
        for subscription in queryset:
            base = subscription.current_period_end if subscription.current_period_end and subscription.current_period_end > now else now
            subscription.current_period_end = base + timedelta(days=days)
            subscription.status = Status.ACTIVE
            subscription.canceled_at = None
            subscription.save()
        messages.success(request, f"{queryset.count()} membresía(s) extendida(s) {days} días.")

    @action(description="Extender 1 mes")
    def extend_month(self, request, queryset):
        self._extend(request, queryset, 30)

    @action(description="Extender 1 año")
    def extend_year(self, request, queryset):
        self._extend(request, queryset, 365)

    @action(description="Cancelar ahora (quita el acceso)")
    def cancel_now(self, request, queryset):
        stripe_ones = queryset.exclude(stripe_subscription_id="").count()
        queryset.update(status=Status.CANCELED, canceled_at=timezone.now(), current_period_end=timezone.now())
        text = f"{queryset.count()} membresía(s) cancelada(s)."
        if stripe_ones:
            text += " Las de Stripe cancelalas también en Stripe para que no se vuelvan a cobrar."
        messages.warning(request, text)
