from django.conf import settings
from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html, format_html_join
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import display

from apps.core.images import thumbnail_html

from .models import Professional, ProfessionalPhoto, QuoteRequest, QuoteStatus, Review, Specialty
from .quotes import notify_quote_response


@admin.register(Specialty)
class SpecialtyAdmin(ModelAdmin):
    list_display = ["name_es", "name_en", "slug", "icon", "order"]
    list_editable = ["order"]
    search_fields = ["name_es", "name_en"]
    prepopulated_fields = {"slug": ("name_en",)}


class ProfessionalPhotoInline(TabularInline):
    model = ProfessionalPhoto
    extra = 0
    fields = ["preview", "order", "image", "caption"]
    readonly_fields = ["preview"]

    @admin.display(description="Vista previa")
    def preview(self, obj):
        return thumbnail_html(obj.thumbnail or obj.image) if obj and obj.pk else "—"


@admin.register(Professional)
class ProfessionalAdmin(ModelAdmin):
    list_display = ["logo_preview", "name", "specialty_list", "city", "country", "verified", "is_published"]
    list_display_links = ["logo_preview", "name"]
    list_filter = ["is_published", "verified", "specialties", "country"]
    search_fields = ["name", "headline", "city", "service_area"]
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["country", "region"]
    filter_horizontal = ["specialties"]
    inlines = [ProfessionalPhotoInline]
    readonly_fields = ["app_link"]
    actions = ["publish", "unpublish", "mark_verified"]
    fieldsets = (
        (None, {"fields": ("name", "slug", "is_published", "verified", "app_link")}),
        ("Perfil", {"fields": ("specialties", "headline", "description", "logo", "languages")}),
        ("Ubicación", {"fields": ("country", "region", "city", "address", "service_area", "latitude", "longitude")}),
        ("Contacto", {"fields": ("whatsapp", "email", "phone", "website", "instagram")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("country").prefetch_related("specialties")

    @admin.display(description="")
    def logo_preview(self, obj):
        return thumbnail_html(obj.logo, size=40)

    @admin.display(description="Especialidades")
    def specialty_list(self, obj):
        return ", ".join(s.name_es for s in obj.specialties.all())

    @admin.display(description="En la app")
    def app_link(self, obj):
        if not obj or not obj.pk:
            return "Se genera al guardar."
        url = f"{settings.FRONTEND_URL.rstrip('/')}/professionals/{obj.slug}"
        return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', url, url)

    @admin.action(description="Publicar", permissions=["change"])
    def publish(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_published=True)} profesional(es) publicados.", messages.SUCCESS)

    @admin.action(description="Ocultar de la app", permissions=["change"])
    def unpublish(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_published=False)} profesional(es) ocultados.", messages.SUCCESS)

    @admin.action(description="Marcar datos como confirmados por el profesional", permissions=["change"])
    def mark_verified(self, request, queryset):
        self.message_user(request, f"{queryset.update(verified=True)} profesional(es) con datos confirmados.", messages.SUCCESS)


# ---------- Pedidos de presupuesto y reseñas

QUOTE_LABELS = {
    QuoteStatus.PENDING: "Pendiente",
    QuoteStatus.SENT: "Enviado",
    QuoteStatus.ANSWERED: "Respondido",
    QuoteStatus.CLOSED: "Cerrado",
    QuoteStatus.CANCELLED: "Cancelado",
}


def pending_quotes_badge(request):
    """Pedidos que el equipo tiene que reenviar (el profesional no tiene email)."""
    count = QuoteRequest.objects.filter(status=QuoteStatus.PENDING).count()
    return str(count) if count else ""


@admin.register(QuoteRequest)
class QuoteRequestAdmin(ModelAdmin):
    """
    Los pedidos llegan desde la app. Si el profesional tiene email, ya se le envió ("Enviado").
    Los "Pendientes" hay que hacérselos llegar; al cargar una respuesta se le avisa al navegante.
    """

    list_display = ["created_at", "professional", "contact_name", "specialty", "needed_by", "status_label"]
    list_display_links = ["created_at", "professional"]
    list_filter = ["status", "specialty", "professional__country"]
    search_fields = ["professional__name", "contact_name", "contact_email", "details"]
    list_select_related = ["professional", "specialty"]
    readonly_fields = [
        "professional", "user", "specialty", "boat", "boat_description", "details", "location", "needed_by",
        "contact_name", "contact_email", "contact_phone", "contact_links", "professional_contact", "created_at", "responded_at",
    ]
    fieldsets = (
        ("Respuesta", {"fields": ("status", "response", "staff_notes", "responded_at")}),
        ("Pedido", {"fields": ("professional", "professional_contact", "specialty", "details", "location", "needed_by", "created_at")}),
        ("Barco", {"fields": ("boat_description", "boat")}),
        ("Navegante", {"fields": ("user", "contact_name", "contact_email", "contact_phone", "contact_links")}),
    )

    def has_add_permission(self, request):
        return False  # se piden desde la app

    @display(description="Estado", label={"Pendiente": "warning", "Enviado": "info", "Respondido": "success", "Cerrado": "info", "Cancelado": "danger"})
    def status_label(self, obj):
        return QUOTE_LABELS[obj.status]

    @admin.display(description="Contactar al navegante")
    def contact_links(self, obj):
        links = [("mailto:" + obj.contact_email, "Email")]
        phone = "".join(c for c in obj.contact_phone if c.isdigit())
        if phone:
            links.append((f"https://wa.me/{phone}", "WhatsApp"))
        return format_html_join(" · ", '<a href="{}" target="_blank" rel="noopener">{}</a>', links)

    @admin.display(description="Contacto del profesional")
    def professional_contact(self, obj):
        p = obj.professional
        parts = [x for x in [p.email, p.phone, p.whatsapp and f"WhatsApp {p.whatsapp}"] if x]
        return " · ".join(parts) or "Sin datos de contacto cargados."

    def save_model(self, request, obj, form, change):
        answered = change and ("status" in form.changed_data or "response" in form.changed_data)
        if answered and obj.status != QuoteStatus.CANCELLED:
            obj.responded_at = timezone.now()
        super().save_model(request, obj, form, change)
        if answered and obj.status != QuoteStatus.CANCELLED:
            notify_quote_response(obj)
            self.message_user(request, "Se le avisó al navegante en la app y por email.", messages.INFO)


@admin.register(Review)
class ReviewAdmin(ModelAdmin):
    list_display = ["created_at", "professional", "author", "rating_stars", "short_comment", "is_visible"]
    list_filter = ["is_visible", "rating", "professional"]
    search_fields = ["professional__name", "comment", "user__email"]
    list_select_related = ["professional", "user"]
    readonly_fields = ["professional", "user", "rating", "comment", "created_at", "updated_at"]
    fields = ["is_visible", "professional", "user", "rating", "comment", "created_at", "updated_at"]
    actions = ["hide", "show"]

    def has_add_permission(self, request):
        return False  # las escriben los navegantes desde la app

    @admin.display(description="Navegante")
    def author(self, obj):
        return obj.user.email

    @admin.display(description="Puntaje", ordering="rating")
    def rating_stars(self, obj):
        return "★" * obj.rating + "☆" * (5 - obj.rating)

    @admin.display(description="Comentario")
    def short_comment(self, obj):
        return (obj.comment[:80] + "…") if len(obj.comment) > 80 else obj.comment

    @admin.action(description="Ocultar de la app", permissions=["change"])
    def hide(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_visible=False)} reseña(s) ocultadas.", messages.SUCCESS)

    @admin.action(description="Volver a mostrar", permissions=["change"])
    def show(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_visible=True)} reseña(s) visibles.", messages.SUCCESS)
