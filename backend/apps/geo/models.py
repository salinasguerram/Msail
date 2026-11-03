from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import get_language
from django.utils.translation import gettext_lazy as _


class Continent(models.TextChoices):
    AFRICA = "AF", _("África")
    ANTARCTICA = "AN", _("Antártida")
    ASIA = "AS", _("Asia")
    EUROPE = "EU", _("Europa")
    NORTH_AMERICA = "NA", _("América del Norte")
    OCEANIA = "OC", _("Oceanía")
    SOUTH_AMERICA = "SA", _("América del Sur")


class Located(models.Model):
    """Coordenadas para ubicar el elemento en el planeta 3D y en los mapas."""

    latitude = models.DecimalField(
        _("latitud"),
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        _("longitud"),
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )

    class Meta:
        abstract = True


class TranslatedName(models.Model):
    """Nombre en español e inglés; `name` devuelve el del idioma activo."""

    name_es = models.CharField(_("nombre (español)"), max_length=120)
    name_en = models.CharField(_("nombre (inglés)"), max_length=120)

    class Meta:
        abstract = True

    @property
    def name(self):
        if (get_language() or "es").startswith("en"):
            return self.name_en
        return self.name_es

    def __str__(self):
        return self.name


class Country(TranslatedName, Located):
    iso_code = models.CharField(_("código ISO"), max_length=2, unique=True)
    continent = models.CharField(_("continente"), max_length=2, choices=Continent.choices)

    class Meta:
        verbose_name = _("país")
        verbose_name_plural = _("países")
        ordering = ["name_es"]


class Region(TranslatedName, Located):
    """Región o centro náutico dentro de un país (ej. Florida, Baleares, Valparaíso)."""

    country = models.ForeignKey(
        Country,
        verbose_name=_("país"),
        on_delete=models.CASCADE,
        related_name="regions",
    )
    slug = models.SlugField(_("slug"), max_length=140)

    class Meta:
        verbose_name = _("región")
        verbose_name_plural = _("regiones")
        ordering = ["country__name_es", "name_es"]
        constraints = [
            models.UniqueConstraint(fields=["country", "slug"], name="unique_region_slug_per_country"),
        ]
