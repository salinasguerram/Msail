from decimal import Decimal

from django.conf import settings
from django.contrib import admin, messages
from django.db.models import Count, Q
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html, format_html_join
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import display

from apps.core.images import thumbnail_html

from .models import BerthRequest, Marina, MarinaPhoto, MarinaRate, RequestStatus
from .requests import notify_response


class MarinaPhotoInline(TabularInline):
    model = MarinaPhoto
    extra = 0
    fields = ["preview", "order", "image", "caption", "credit"]
    readonly_fields = ["preview"]

    @admin.display(description="Vista previa")
    def preview(self, obj):
        return thumbnail_html(obj.thumbnail or obj.image) if obj and obj.pk else "—"


class MarinaRateInline(TabularInline):
    model = MarinaRate
    extra = 0
    fields = ["order", "label", "amount", "currency", "unit", "min_length_m", "max_length_m"]
    verbose_name_plural = "tarifas orientativas (solo las que informa la marina; la primera se ve en el listado)"


class BerthRequestInline(TabularInline):
    """Últimas solicitudes de la marina (solo lectura; se gestionan en "Solicitudes de amarre")."""

    model = BerthRequest
    extra = 0
    max_num = 0
    can_delete = False
    fields = ["open_link", "boat_name", "arrival", "departure", "status"]
    readonly_fields = fields
    verbose_name_plural = "solicitudes de amarre"
    classes = ["collapse"]

    @admin.display(description="Solicitud")
    def open_link(self, obj):
        url = reverse("admin:marinas_berthrequest_change", args=[obj.pk])
        return format_html('<a href="{}">#{} · {}</a>', url, obj.pk, obj.created_at.strftime("%d/%m/%Y"))


@admin.register(Marina)
class MarinaAdmin(ModelAdmin):
    list_display = [
        "name", "city", "country", "max_length_m", "max_draft_m", "has_price", "pending_requests", "verified", "is_published",
    ]
    actions = ["publish", "unpublish", "mark_verified"]
    list_filter = ["is_published", "verified", "country", "fuel", "showers", ("rates", admin.EmptyFieldListFilter)]
    search_fields = ["name", "city", "address"]
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["country", "region"]
    inlines = [MarinaRateInline, MarinaPhotoInline, BerthRequestInline]
    readonly_fields = ["app_link"]
    fieldsets = (
        (None, {"fields": ("name", "slug", "is_published", "verified", "app_link", "description")}),
        ("Ubicación", {"fields": ("country", "region", "city", "address", "latitude", "longitude")}),
        ("Contacto", {"fields": ("website", "email", "phone", "whatsapp", "vhf_channel")}),
        ("Capacidad", {"fields": ("berths", "max_length_m", "max_draft_m")}),
        ("Precio orientativo", {"fields": ("prices_updated_on", "price_notes")}),
        (
            "Servicios informados",
            {
                "fields": (("water", "electricity", "showers", "fuel"), ("wifi", "laundry", "security", "boatyard")),
                "description": "Marcá solo lo que la marina informa. Lo no marcado se muestra como «no informado».",
            },
        ),
    )

    @admin.display(description="En la app")
    def app_link(self, obj):
        if not obj or not obj.pk:
            return "Se genera al guardar."
        url = f"{settings.FRONTEND_URL.rstrip('/')}/marinas/{obj.slug}"
        return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', url, url)

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("country")
            .annotate(
                pending_count=Count("requests", filter=Q(requests__status=RequestStatus.PENDING), distinct=True),
                rates_count=Count("rates", distinct=True),
            )
        )

    @display(description="Pendientes", ordering="pending_count", label={"0": "info"})
    def pending_requests(self, obj):
        return str(obj.pending_count) if obj.pending_count else "—"

    @admin.display(description="Precio", boolean=True)
    def has_price(self, obj):
        return bool(obj.rates_count)

    @admin.action(description="Publicar", permissions=["change"])
    def publish(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_published=True)} marina(s) publicadas.", messages.SUCCESS)

    @admin.action(description="Ocultar de la app", permissions=["change"])
    def unpublish(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_published=False)} marina(s) ocultadas.", messages.SUCCESS)

    @admin.action(description="Marcar datos como confirmados por la marina", permissions=["change"])
    def mark_verified(self, request, queryset):
        self.message_user(request, f"{queryset.update(verified=True)} marina(s) con datos confirmados.", messages.SUCCESS)


FEET_PER_METER = Decimal("3.28084")

STATUS_LABELS = {
    RequestStatus.PENDING: "Pendiente",
    RequestStatus.ACCEPTED: "Aceptada",
    RequestStatus.REJECTED: "Rechazada",
    RequestStatus.CANCELLED: "Cancelada",
}


def pending_badge(request):
    """Cantidad de solicitudes pendientes, para el menú lateral del panel."""
    count = BerthRequest.objects.filter(status=RequestStatus.PENDING).count()
    return str(count) if count else ""


@admin.register(BerthRequest)
class BerthRequestAdmin(ModelAdmin):
    """Las solicitudes llegan desde la app. El equipo las gestiona con la marina y responde desde acá."""

    list_display = ["created_at", "marina", "boat_name", "length_m", "arrival", "departure", "nights_display", "contact_name", "status_label"]
    list_display_links = ["created_at", "boat_name"]
    list_filter = ["status", "marina__country", "marina"]
    search_fields = ["boat_name", "contact_name", "contact_email", "marina__name"]
    date_hierarchy = "arrival"
    list_select_related = ["marina"]
    actions = ["accept", "reject"]
    readonly_fields = [
        "marina", "user", "boat", "boat_name", "boat_type", "length_m", "beam_m", "draft_m",
        "arrival", "departure", "nights_display", "contact_name", "contact_email", "contact_phone", "contact_links",
        "message", "created_at", "responded_at", "estimate",
    ]
    fieldsets = (
        ("Respuesta", {"fields": ("status", "response", "staff_notes", "responded_at")}),
        ("Pedido", {"fields": ("marina", "arrival", "departure", "nights_display", "estimate", "message", "created_at")}),
        ("Barco", {"fields": ("boat_name", "boat_type", "length_m", "beam_m", "draft_m", "boat")}),
        ("Navegante", {"fields": ("user", "contact_name", "contact_email", "contact_phone", "contact_links")}),
    )

    def has_add_permission(self, request):
        return False  # se piden desde la app

    @display(description="Estado", label={"Pendiente": "warning", "Aceptada": "success", "Rechazada": "danger", "Cancelada": "info"})
    def status_label(self, obj):
        return STATUS_LABELS[obj.status]

    @admin.display(description="Noches")
    def nights_display(self, obj):
        return obj.nights

    @admin.display(description="Contactar")
    def contact_links(self, obj):
        links = [("mailto:" + obj.contact_email, "Email")]
        phone = "".join(c for c in obj.contact_phone if c.isdigit())
        if phone:
            links += [(f"https://wa.me/{phone}", "WhatsApp"), (f"tel:+{phone}", "Llamar")]
        return format_html_join(" · ", '<a href="{}" target="_blank" rel="noopener">{}</a>', links)

    @admin.display(description="Precio orientativo")
    def estimate(self, obj):
        """Lo que sale con las tarifas cargadas de la marina, como referencia al responder."""
        rows = []
        for rate in obj.marina.rates.all():
            if (rate.min_length_m and obj.length_m < rate.min_length_m) or (rate.max_length_m and obj.length_m > rate.max_length_m):
                continue
            per_night = rate.unit.endswith("night")
            if rate.unit in ("meter_night", "meter_month"):
                price = rate.amount * obj.length_m
            elif rate.unit == "foot_night":
                price = rate.amount * obj.length_m * FEET_PER_METER
            else:
                price = rate.amount
            total = price * obj.nights if per_night else price
            rows.append((rate.label, f"{total:.2f} {rate.currency}", f"{obj.nights} noches" if per_night else "por mes"))
        if not rows:
            return "La marina no tiene tarifas cargadas para esta eslora."
        return format_html_join(format_html("<br>"), "{}: <b>{}</b> ({})", rows)

    def save_model(self, request, obj, form, change):
        answered = change and ("status" in form.changed_data or "response" in form.changed_data)
        if answered and obj.status != RequestStatus.CANCELLED:
            obj.responded_at = timezone.now()
        super().save_model(request, obj, form, change)
        if answered and obj.status != RequestStatus.CANCELLED:
            notify_response(obj)
            self.message_user(request, "Se le avisó al navegante en la app y por email.", messages.INFO)

    def _answer(self, request, queryset, status, default_response):
        updated = 0
        for berth_request in queryset.filter(status=RequestStatus.PENDING).select_related("marina", "user"):
            berth_request.status = status
            berth_request.response = berth_request.response or default_response
            berth_request.responded_at = timezone.now()
            berth_request.save(update_fields=["status", "response", "responded_at", "updated_at"])
            notify_response(berth_request)
            updated += 1
        self.message_user(request, f"{updated} solicitud(es) respondidas y avisadas al navegante.", messages.SUCCESS)

    @admin.action(description="Aceptar (y avisar al navegante)", permissions=["change"])
    def accept(self, request, queryset):
        self._answer(request, queryset, RequestStatus.ACCEPTED, "La marina confirmó tu amarre para esas fechas.")

    @admin.action(description="Rechazar (y avisar al navegante)", permissions=["change"])
    def reject(self, request, queryset):
        self._answer(request, queryset, RequestStatus.REJECTED, "La marina no tiene lugar para esas fechas.")
