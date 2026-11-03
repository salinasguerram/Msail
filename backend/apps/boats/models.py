from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.profiles.models import SailingRole


def positive_measure(max_value):
    return [MinValueValidator(0.1), MaxValueValidator(max_value)]


class Boat(models.Model):
    """Embarcación con sus datos técnicos. La crea y administra su dueño."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("dueño"),
        on_delete=models.CASCADE,
        related_name="boats",
    )
    name = models.CharField(_("nombre"), max_length=120)
    boat_class = models.ForeignKey(
        "sailing.BoatClass",
        verbose_name=_("clase"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="boats",
    )
    model = models.CharField(_("modelo"), max_length=120, blank=True, help_text=_("Ej: Beneteau First 36.7"))
    builder = models.CharField(_("astillero"), max_length=120, blank=True)
    designer = models.CharField(_("diseñador"), max_length=120, blank=True)
    year_built = models.PositiveSmallIntegerField(
        _("año de construcción"), null=True, blank=True, validators=[MinValueValidator(1850)]
    )
    sail_number = models.CharField(_("número de vela"), max_length=30, blank=True)
    hull_color = models.CharField(_("color del casco"), max_length=40, blank=True)

    # Medidas en metros / kilos. La app las puede mostrar también en pies.
    length_m = models.DecimalField(
        _("eslora (m)"), max_digits=5, decimal_places=2, null=True, blank=True, validators=positive_measure(150)
    )
    beam_m = models.DecimalField(
        _("manga (m)"), max_digits=5, decimal_places=2, null=True, blank=True, validators=positive_measure(40)
    )
    draft_m = models.DecimalField(
        _("calado (m)"), max_digits=4, decimal_places=2, null=True, blank=True, validators=positive_measure(15)
    )
    displacement_kg = models.PositiveIntegerField(
        _("desplazamiento (kg)"), null=True, blank=True, validators=[MaxValueValidator(2_000_000)]
    )
    rating = models.CharField(_("rating / certificado"), max_length=80, blank=True, help_text=_("Ej: ORC 585.2"))

    home_port = models.CharField(_("puerto base"), max_length=120, blank=True)
    country = models.ForeignKey(
        "geo.Country",
        verbose_name=_("país"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="boats",
    )
    home_club = models.ForeignKey(
        "sailing.Club",
        verbose_name=_("club"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="boats",
    )
    description = models.TextField(_("descripción"), max_length=2000, blank=True)
    is_public = models.BooleanField(_("público"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("embarcación")
        verbose_name_plural = _("embarcaciones")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.sail_number})" if self.sail_number else self.name

    def clean(self):
        if self.year_built and self.year_built > timezone.now().year + 1:
            raise ValidationError({"year_built": _("El año no puede ser futuro.")})


class CrewMember(models.Model):
    """
    Tripulante de una embarcación. Puede ser un usuario de MSAIL o solo un nombre,
    porque muchos tripulantes todavía no tienen cuenta.
    """

    boat = models.ForeignKey(Boat, verbose_name=_("embarcación"), on_delete=models.CASCADE, related_name="crew")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("usuario"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crew_positions",
    )
    name = models.CharField(_("nombre"), max_length=120, blank=True)
    role = models.CharField(_("puesto"), max_length=20, choices=SailingRole.choices, blank=True)
    is_active = models.BooleanField(_("tripulación actual"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("tripulante")
        verbose_name_plural = _("tripulación")
        ordering = ["-is_active", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["boat", "user"], condition=models.Q(user__isnull=False), name="unique_crew_user_per_boat"
            ),
        ]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self):
        if self.user_id:
            return self.user.get_full_name() or self.user.email.split("@")[0]
        return self.name

    def clean(self):
        if not self.user_id and not self.name.strip():
            raise ValidationError({"name": _("Indicá el nombre del tripulante.")})


class BoatPhoto(models.Model):
    MAX_PER_BOAT = 20

    boat = models.ForeignKey(Boat, verbose_name=_("embarcación"), on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(_("foto"), upload_to="boats/")
    caption = models.CharField(_("descripción"), max_length=200, blank=True)
    is_cover = models.BooleanField(_("portada"), default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("foto de la embarcación")
        verbose_name_plural = _("fotos de la embarcación")
        ordering = ["-is_cover", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["boat"], condition=models.Q(is_cover=True), name="one_cover_per_boat"),
        ]

    def __str__(self):
        return self.caption or f"Foto {self.pk}"
