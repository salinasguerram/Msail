from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.text import normalize
from apps.geo.models import Located, TranslatedName

# Especialidades iniciales (slug, español, inglés, ícono de Ionicons para la app). Se cargan con una migración;
# después se pueden agregar más desde el panel.
DEFAULT_SPECIALTIES = [
    ("sailmaking", "Velería", "Sailmaking", "flag-outline"),
    ("rigging", "Rigging / jarcia", "Rigging", "git-network-outline"),
    ("mechanics", "Mecánica", "Engine mechanics", "cog-outline"),
    ("composites", "Fibra y composites", "Fibreglass & composites", "layers-outline"),
    ("electronics", "Electrónica y electricidad", "Electronics & electrical", "flash-outline"),
    ("boatyard", "Astillero / refit", "Boatyard & refit", "construct-outline"),
    ("canvas", "Tapicería y lonas", "Canvas & upholstery", "cut-outline"),
    ("coaching", "Entrenador / coach", "Coaching", "school-outline"),
    ("delivery", "Patrón / traslados", "Delivery skipper", "navigate-outline"),
    ("surveying", "Peritaje / surveyor", "Marine surveying", "clipboard-outline"),
    ("diving", "Buzo / limpieza de casco", "Diving & hull cleaning", "water-outline"),
]


class Specialty(TranslatedName):
    slug = models.SlugField(_("slug"), max_length=60, unique=True)
    icon = models.CharField(_("ícono"), max_length=40, blank=True, help_text=_("Nombre de un ícono de Ionicons. Ej: flag-outline"))
    order = models.PositiveSmallIntegerField(_("orden"), default=0)

    class Meta:
        verbose_name = _("especialidad")
        verbose_name_plural = _("especialidades")
        ordering = ["order", "name_es"]


class Professional(Located):
    """Profesional o empresa de servicios náuticos (velería, rigging, mecánica, entrenadores...)."""

    name = models.CharField(_("nombre"), max_length=160, help_text=_("Empresa o nombre y apellido."))
    slug = models.SlugField(_("slug"), max_length=160, unique=True)
    specialties = models.ManyToManyField(Specialty, verbose_name=_("especialidades"), related_name="professionals")
    headline = models.CharField(_("frase corta"), max_length=160, blank=True, help_text=_("Ej: Velas de regata y crucero a medida."))
    description = models.TextField(_("descripción"), blank=True)
    logo = models.ImageField(_("logo o foto de perfil"), upload_to="professionals/logos/", blank=True)

    country = models.ForeignKey("geo.Country", verbose_name=_("país"), on_delete=models.PROTECT, related_name="professionals")
    region = models.ForeignKey(
        "geo.Region", verbose_name=_("región"), on_delete=models.SET_NULL, null=True, blank=True, related_name="professionals"
    )
    city = models.CharField(_("ciudad"), max_length=120)
    address = models.CharField(_("dirección"), max_length=200, blank=True)
    service_area = models.CharField(
        _("zona de trabajo"), max_length=200, blank=True, help_text=_("Ej: Bahía de Palma y puertos del suroeste.")
    )

    # Contacto
    whatsapp = models.CharField(_("WhatsApp"), max_length=40, blank=True, help_text=_("Con código de país."))
    email = models.EmailField(_("email"), blank=True)
    phone = models.CharField(_("teléfono"), max_length=40, blank=True)
    website = models.URLField(_("sitio web"), blank=True)
    instagram = models.CharField(_("Instagram"), max_length=60, blank=True, help_text=_("Usuario, sin @."))
    languages = models.CharField(_("idiomas"), max_length=120, blank=True, help_text=_("Ej: Español, inglés"))

    verified = models.BooleanField(
        _("datos confirmados por el profesional"),
        default=False,
        help_text=_("Sin marcar, la app avisa que los datos salen de fuentes públicas."),
    )
    is_published = models.BooleanField(_("publicado"), default=True)
    search_text = models.TextField(editable=False, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("profesional")
        verbose_name_plural = _("profesionales")
        ordering = ["name"]

    def __str__(self):
        return self.name

    def build_search_text(self):
        parts = [self.name, self.headline, self.description, self.city, self.address, self.service_area]
        if self.country_id:
            parts += [self.country.name_es, self.country.name_en, self.country.iso_code]
        if self.region_id:
            parts += [self.region.name_es, self.region.name_en]
        if self.pk:
            for specialty in self.specialties.all():
                parts += [specialty.name_es, specialty.name_en]
        return normalize(" ".join(p for p in parts if p))

    def clean(self):
        if self.region_id and self.country_id and self.region.country_id != self.country_id:
            raise ValidationError({"region": _("La región no pertenece al país elegido.")})
        if self.logo and not getattr(self.logo, "_committed", True):
            from apps.core.images import process_image

            process_image(self.logo)
            self.logo.seek(0)

    def save(self, *args, **kwargs):
        from apps.core.images import process_image

        if self.logo and not getattr(self.logo, "_committed", True):
            self.logo.seek(0)
            self.logo = process_image(self.logo.file, max_side=400, square=True)
        self.search_text = self.build_search_text()
        super().save(*args, **kwargs)


class ProfessionalPhoto(models.Model):
    """Foto de trabajos realizados, del taller o del equipo."""

    THUMB_SIDE = 480

    professional = models.ForeignKey(Professional, verbose_name=_("profesional"), on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(_("foto"), upload_to="professionals/")
    thumbnail = models.ImageField(upload_to="professionals/thumbs/", blank=True, editable=False)
    caption = models.CharField(_("descripción"), max_length=200, blank=True)
    order = models.PositiveSmallIntegerField(_("orden"), default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("foto del profesional")
        verbose_name_plural = _("fotos de trabajos")
        ordering = ["order", "id"]

    def __str__(self):
        return self.caption or f"Foto {self.pk}"

    def clean(self):
        if self.image and not getattr(self.image, "_committed", True):
            from apps.core.images import process_image

            process_image(self.image)
            self.image.seek(0)

    def save(self, *args, **kwargs):
        from apps.core.images import process_image

        if self.image and not getattr(self.image, "_committed", True):
            self.image.seek(0)
            original = self.image.file
            self.image = process_image(original)
            original.seek(0)
            self.thumbnail = process_image(original, max_side=self.THUMB_SIDE, square=True)
        super().save(*args, **kwargs)



class QuoteStatus(models.TextChoices):
    PENDING = "pending", _("Pendiente")
    SENT = "sent", _("Enviado al profesional")
    ANSWERED = "answered", _("Respondido")
    CLOSED = "closed", _("Cerrado")
    CANCELLED = "cancelled", _("Cancelado por el navegante")


class QuoteRequest(models.Model):
    """
    Pedido de presupuesto de un navegante a un profesional.
    Si el profesional tiene email, le llega directo (con "responder a" el navegante); si no, lo reenvía el equipo.
    """

    professional = models.ForeignKey(Professional, verbose_name=_("profesional"), on_delete=models.CASCADE, related_name="quotes")
    user = models.ForeignKey("accounts.User", verbose_name=_("navegante"), on_delete=models.CASCADE, related_name="quote_requests")
    specialty = models.ForeignKey(
        Specialty, verbose_name=_("especialidad"), on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    boat = models.ForeignKey("boats.Boat", verbose_name=_("barco en MSAIL"), on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    boat_description = models.CharField(_("barco"), max_length=160, blank=True, help_text=_("Ej: Beneteau First 36.7, 11 m"))
    details = models.TextField(_("qué necesita"), max_length=2000)
    location = models.CharField(_("dónde está el barco"), max_length=160, blank=True)
    needed_by = models.DateField(_("para cuándo"), null=True, blank=True)
    contact_name = models.CharField(_("nombre de contacto"), max_length=120)
    contact_email = models.EmailField(_("email de contacto"))
    contact_phone = models.CharField(_("teléfono / WhatsApp"), max_length=40, blank=True)

    status = models.CharField(_("estado"), max_length=20, choices=QuoteStatus.choices, default=QuoteStatus.PENDING)
    response = models.TextField(_("respuesta al navegante"), blank=True, max_length=2000)
    staff_notes = models.TextField(_("notas internas"), blank=True)
    responded_at = models.DateTimeField(_("respondido el"), null=True, blank=True)
    created_at = models.DateTimeField(_("pedido el"), auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("pedido de presupuesto")
        verbose_name_plural = _("pedidos de presupuesto")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.professional} · {self.contact_name} ({self.created_at:%d/%m/%Y})" if self.created_at else str(self.professional)

    def clean(self):
        from django.utils import timezone

        if self.needed_by and self._state.adding and self.needed_by < timezone.localdate():
            raise ValidationError({"needed_by": _("La fecha no puede ser en el pasado.")})


class Review(models.Model):
    """Reseña de un navegante sobre un profesional (una por navegante; se puede editar)."""

    professional = models.ForeignKey(Professional, verbose_name=_("profesional"), on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey("accounts.User", verbose_name=_("navegante"), on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(_("puntaje"), validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(_("comentario"), max_length=1500, blank=True)
    is_visible = models.BooleanField(_("visible"), default=True, help_text=_("Desmarcalo para ocultar una reseña inapropiada."))
    created_at = models.DateTimeField(_("fecha"), auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("reseña")
        verbose_name_plural = _("reseñas")
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["professional", "user"], name="one_review_per_user")]

    def __str__(self):
        return f"{self.rating}★ · {self.professional}"

    @property
    def is_client(self):
        """Pidió presupuesto a este profesional por MSAIL (se muestra como "cliente verificado")."""
        return QuoteRequest.objects.filter(professional_id=self.professional_id, user_id=self.user_id).exists()
