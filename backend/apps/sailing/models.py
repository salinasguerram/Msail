from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.geo.models import Located


class BoatCategory(models.TextChoices):
    DINGHY = "dinghy", _("Vela ligera")
    KEELBOAT = "keelboat", _("Quilla")
    MULTIHULL = "multihull", _("Multicasco")
    OFFSHORE = "offshore", _("Oceánica")
    FOILING = "foiling", _("Foil")
    BOARD = "board", _("Tabla / Windsurf / Kite")


class BoatClass(models.Model):
    """Clase de embarcación (ILCA, J/70, Optimist, etc.). Se usa para filtrar regatas, noticias y contenido."""

    name = models.CharField(_("nombre"), max_length=80, unique=True)
    slug = models.SlugField(_("slug"), max_length=80, unique=True)
    category = models.CharField(_("categoría"), max_length=20, choices=BoatCategory.choices)
    is_olympic = models.BooleanField(_("clase olímpica"), default=False)
    crew_size = models.PositiveSmallIntegerField(_("tripulantes"), null=True, blank=True)
    description_es = models.TextField(_("descripción (español)"), blank=True)
    description_en = models.TextField(_("descripción (inglés)"), blank=True)
    website = models.URLField(_("sitio web"), blank=True)

    class Meta:
        verbose_name = _("clase de embarcación")
        verbose_name_plural = _("clases de embarcación")
        ordering = ["name"]

    def __str__(self):
        return self.name


class Club(Located):
    """Club náutico o yacht club. Más adelante podrá administrar sus propios eventos."""

    name = models.CharField(_("nombre"), max_length=160)
    slug = models.SlugField(_("slug"), max_length=160, unique=True)
    country = models.ForeignKey(
        "geo.Country",
        verbose_name=_("país"),
        on_delete=models.PROTECT,
        related_name="clubs",
    )
    region = models.ForeignKey(
        "geo.Region",
        verbose_name=_("región"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clubs",
    )
    city = models.CharField(_("ciudad"), max_length=120, blank=True)
    address = models.CharField(_("dirección"), max_length=255, blank=True)
    website = models.URLField(_("sitio web"), blank=True)
    email = models.EmailField(_("email"), blank=True)
    phone = models.CharField(_("teléfono"), max_length=40, blank=True)
    founded_year = models.PositiveSmallIntegerField(_("año de fundación"), null=True, blank=True)
    boat_classes = models.ManyToManyField(
        BoatClass,
        verbose_name=_("clases que navega"),
        blank=True,
        related_name="clubs",
    )
    is_verified = models.BooleanField(_("verificado"), default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("club")
        verbose_name_plural = _("clubes")
        ordering = ["name"]

    def __str__(self):
        return self.name
