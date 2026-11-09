from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.text import normalize
from apps.geo.models import Located

# Servicios que se pueden informar. Que un servicio no esté marcado significa "no informado", no "no hay".
SERVICES = [
    ("water", _("Agua")),
    ("electricity", _("Luz")),
    ("showers", _("Duchas")),
    ("fuel", _("Combustible")),
    ("wifi", _("Wi-Fi")),
    ("laundry", _("Lavandería")),
    ("security", _("Seguridad 24 h")),
    ("boatyard", _("Varadero / travel lift")),
]
SERVICE_KEYS = [key for key, _label in SERVICES]


class Marina(Located):
    """Marina o puerto deportivo del directorio."""

    name = models.CharField(_("nombre"), max_length=200)
    slug = models.SlugField(_("slug"), max_length=200, unique=True)
    country = models.ForeignKey("geo.Country", verbose_name=_("país"), on_delete=models.PROTECT, related_name="marinas")
    region = models.ForeignKey(
        "geo.Region", verbose_name=_("región"), on_delete=models.SET_NULL, null=True, blank=True, related_name="marinas"
    )
    city = models.CharField(_("ciudad"), max_length=120)
    address = models.CharField(_("dirección"), max_length=200, blank=True)
    description = models.TextField(_("descripción"), blank=True)

    # Contacto
    website = models.URLField(_("sitio web"), blank=True)
    email = models.EmailField(_("email"), blank=True)
    phone = models.CharField(_("teléfono"), max_length=40, blank=True, help_text=_("Con código de país. Ej: +34 971 171 100"))
    whatsapp = models.CharField(_("WhatsApp"), max_length=40, blank=True, help_text=_("Con código de país, solo números."))
    vhf_channel = models.CharField(_("canal VHF"), max_length=10, blank=True)

    # Capacidad
    berths = models.PositiveIntegerField(_("amarres"), null=True, blank=True)
    max_length_m = models.DecimalField(
        _("eslora máxima (m)"), max_digits=5, decimal_places=1, null=True, blank=True, validators=[MinValueValidator(1)]
    )
    max_draft_m = models.DecimalField(
        _("profundidad / calado máximo (m)"), max_digits=4, decimal_places=1, null=True, blank=True, validators=[MinValueValidator(0.5)]
    )

    # Servicios informados
    water = models.BooleanField(_("agua"), default=False)
    electricity = models.BooleanField(_("luz"), default=False)
    showers = models.BooleanField(_("duchas"), default=False)
    fuel = models.BooleanField(_("combustible"), default=False)
    wifi = models.BooleanField(_("Wi-Fi"), default=False)
    laundry = models.BooleanField(_("lavandería"), default=False)
    security = models.BooleanField(_("seguridad 24 h"), default=False)
    boatyard = models.BooleanField(_("varadero / travel lift"), default=False)

    # Precio orientativo (solo si la marina lo informa)
    prices_updated_on = models.DateField(
        _("precios informados el"), null=True, blank=True, help_text=_("Fecha en que la marina informó las tarifas.")
    )
    price_notes = models.CharField(
        _("aclaraciones del precio"), max_length=300, blank=True, help_text=_("Ej: IVA incluido. Luz y agua aparte.")
    )

    verified = models.BooleanField(
        _("datos confirmados por la marina"),
        default=False,
        help_text=_("Sin marcar, la app avisa que los datos salen de fuentes públicas y conviene confirmarlos."),
    )
    is_published = models.BooleanField(_("publicada"), default=True)
    search_text = models.TextField(editable=False, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("marina")
        verbose_name_plural = _("marinas")
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def services(self):
        return [key for key in SERVICE_KEYS if getattr(self, key)]

    def build_search_text(self):
        parts = [self.name, self.city, self.address, self.description]
        if self.country_id:
            parts += [self.country.name_es, self.country.name_en, self.country.iso_code]
        if self.region_id:
            parts += [self.region.name_es, self.region.name_en]
        return normalize(" ".join(p for p in parts if p))

    def save(self, *args, **kwargs):
        self.search_text = self.build_search_text()
        super().save(*args, **kwargs)

    def clean(self):
        if self.region_id and self.country_id and self.region.country_id != self.country_id:
            raise ValidationError({"region": _("La región no pertenece al país elegido.")})


class MarinaPhoto(models.Model):
    THUMB_SIDE = 480

    marina = models.ForeignKey(Marina, verbose_name=_("marina"), on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(_("foto"), upload_to="marinas/")
    thumbnail = models.ImageField(upload_to="marinas/thumbs/", blank=True, editable=False)
    caption = models.CharField(_("descripción"), max_length=200, blank=True)
    credit = models.CharField(_("crédito"), max_length=120, blank=True)
    order = models.PositiveSmallIntegerField(_("orden"), default=0, help_text=_("La primera es la portada."))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("foto de la marina")
        verbose_name_plural = _("fotos de la marina")
        ordering = ["order", "id"]

    def __str__(self):
        return self.caption or f"Foto {self.pk}"

    def clean(self):
        if self.image and not getattr(self.image, "_committed", True):
            from apps.core.images import process_image

            process_image(self.image)  # valida que sea una imagen real
            self.image.seek(0)

    def save(self, *args, **kwargs):
        from apps.core.images import process_image

        if self.image and not getattr(self.image, "_committed", True):
            # Foto nueva: se recomprime sin datos GPS y se genera la miniatura.
            self.image.seek(0)
            original = self.image.file
            self.image = process_image(original)
            original.seek(0)
            self.thumbnail = process_image(original, max_side=self.THUMB_SIDE, square=True)
        super().save(*args, **kwargs)


class RateUnit(models.TextChoices):
    PER_METER_NIGHT = "meter_night", _("por metro de eslora y noche")
    PER_FOOT_NIGHT = "foot_night", _("por pie de eslora y noche")
    PER_BOAT_NIGHT = "boat_night", _("por barco y noche")
    PER_METER_MONTH = "meter_month", _("por metro de eslora y mes")
    PER_BOAT_MONTH = "boat_month", _("por barco y mes")


CURRENCIES = [
    ("EUR", "EUR €"),
    ("USD", "USD $"),
    ("GBP", "GBP £"),
    ("BRL", "BRL R$"),
    ("ARS", "ARS $"),
    ("CLP", "CLP $"),
    ("UYU", "UYU $"),
    ("AUD", "AUD $"),
    ("NZD", "NZD $"),
]


class MarinaRate(models.Model):
    """Tarifa orientativa informada por la marina (ej. "Temporada alta, por metro y noche")."""

    marina = models.ForeignKey(Marina, verbose_name=_("marina"), on_delete=models.CASCADE, related_name="rates")
    label = models.CharField(_("nombre"), max_length=120, help_text=_("Ej: Temporada alta (jun–sep), Amarre mensual."))
    amount = models.DecimalField(_("importe"), max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    currency = models.CharField(_("moneda"), max_length=3, choices=CURRENCIES, default="EUR")
    unit = models.CharField(_("unidad"), max_length=20, choices=RateUnit.choices, default=RateUnit.PER_METER_NIGHT)
    min_length_m = models.DecimalField(_("desde eslora (m)"), max_digits=5, decimal_places=1, null=True, blank=True)
    max_length_m = models.DecimalField(_("hasta eslora (m)"), max_digits=5, decimal_places=1, null=True, blank=True)
    order = models.PositiveSmallIntegerField(_("orden"), default=0, help_text=_("La primera se muestra en el listado."))

    class Meta:
        verbose_name = _("tarifa")
        verbose_name_plural = _("tarifas orientativas")
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.label}: {self.amount} {self.currency} {self.get_unit_display()}"

    def clean(self):
        if self.min_length_m and self.max_length_m and self.min_length_m > self.max_length_m:
            raise ValidationError({"max_length_m": _("La eslora máxima no puede ser menor que la mínima.")})



class BoatType(models.TextChoices):
    SAILBOAT = "sailboat", _("Velero")
    CATAMARAN = "catamaran", _("Catamarán")
    MOTOR = "motor", _("Lancha / motor")


class RequestStatus(models.TextChoices):
    PENDING = "pending", _("Pendiente")
    ACCEPTED = "accepted", _("Aceptada")
    REJECTED = "rejected", _("Rechazada")
    CANCELLED = "cancelled", _("Cancelada por el navegante")


MAX_NIGHTS = 365


class BerthRequest(models.Model):
    """Solicitud de amarre de un navegante. Llega al panel, donde el equipo la gestiona con la marina y responde."""

    marina = models.ForeignKey(Marina, verbose_name=_("marina"), on_delete=models.CASCADE, related_name="requests")
    user = models.ForeignKey("accounts.User", verbose_name=_("navegante"), on_delete=models.CASCADE, related_name="berth_requests")
    boat = models.ForeignKey(
        "boats.Boat", verbose_name=_("barco en MSAIL"), on_delete=models.SET_NULL, null=True, blank=True, related_name="berth_requests"
    )
    # Datos del velero (se copian del barco si se eligió uno; quedan fijos aunque el barco cambie).
    boat_name = models.CharField(_("barco"), max_length=120)
    boat_type = models.CharField(_("tipo"), max_length=20, choices=BoatType.choices, default=BoatType.SAILBOAT)
    length_m = models.DecimalField(_("eslora (m)"), max_digits=5, decimal_places=2, validators=[MinValueValidator(Decimal("1"))])
    beam_m = models.DecimalField(_("manga (m)"), max_digits=5, decimal_places=2, null=True, blank=True)
    draft_m = models.DecimalField(_("calado (m)"), max_digits=4, decimal_places=2, null=True, blank=True)
    # Fechas
    arrival = models.DateField(_("llegada"))
    departure = models.DateField(_("salida"))
    # Contacto
    contact_name = models.CharField(_("nombre de contacto"), max_length=120)
    contact_email = models.EmailField(_("email de contacto"))
    contact_phone = models.CharField(_("teléfono / WhatsApp"), max_length=40, blank=True)
    message = models.TextField(_("mensaje"), blank=True, max_length=1000)

    status = models.CharField(_("estado"), max_length=20, choices=RequestStatus.choices, default=RequestStatus.PENDING)
    response = models.TextField(
        _("respuesta al navegante"), blank=True, max_length=1000, help_text=_("La ve el navegante en la app y le llega por email.")
    )
    staff_notes = models.TextField(_("notas internas"), blank=True, help_text=_("Solo las ve el equipo de MSAIL."))
    responded_at = models.DateTimeField(_("respondida el"), null=True, blank=True)
    created_at = models.DateTimeField(_("pedida el"), auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("solicitud de amarre")
        verbose_name_plural = _("solicitudes de amarre")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        return f"{self.boat_name} → {self.marina} ({self.arrival:%d/%m})"

    @property
    def nights(self):
        return (self.departure - self.arrival).days if self.arrival and self.departure else 0

    def clean(self):
        from django.utils import timezone

        errors = {}
        if self.arrival and self._state.adding and self.arrival < timezone.localdate():
            errors["arrival"] = _("La llegada no puede ser en el pasado.")
        if self.arrival and self.departure:
            if self.departure <= self.arrival:
                errors["departure"] = _("La salida tiene que ser después de la llegada.")
            elif self.nights > MAX_NIGHTS:
                errors["departure"] = _("La estadía no puede superar los %(max)s días.") % {"max": MAX_NIGHTS}
        if self.marina_id and self.length_m and self.marina.max_length_m and self.length_m > self.marina.max_length_m:
            errors["length_m"] = _("La marina recibe barcos de hasta %(max)s m de eslora.") % {"max": self.marina.max_length_m}
        if self.marina_id and self.draft_m and self.marina.max_draft_m and self.draft_m > self.marina.max_draft_m:
            errors["draft_m"] = _("La marina tiene %(max)s m de profundidad.") % {"max": self.marina.max_draft_m}
        if errors:
            raise ValidationError(errors)
