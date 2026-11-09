from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class ExperienceLevel(models.TextChoices):
    BEGINNER = "beginner", _("Principiante")
    INTERMEDIATE = "intermediate", _("Intermedio")
    ADVANCED = "advanced", _("Avanzado")
    PROFESSIONAL = "professional", _("Profesional")


class SailingRole(models.TextChoices):
    """Puestos a bordo. Sirven para el perfil y, más adelante, para buscar tripulantes."""

    SKIPPER = "skipper", _("Patrón / Skipper")
    HELMSMAN = "helmsman", _("Timonel")
    TACTICIAN = "tactician", _("Táctico")
    NAVIGATOR = "navigator", _("Navegante")
    TRIMMER = "trimmer", _("Trimmer")
    PITMAN = "pitman", _("Piano / Pitman")
    BOWMAN = "bowman", _("Proa")
    CREW = "crew", _("Tripulante")
    COACH = "coach", _("Entrenador")


def validate_roles(value):
    if not isinstance(value, list) or any(role not in SailingRole.values for role in value):
        raise ValidationError(_("Puesto a bordo inválido."))


class SailorProfile(models.Model):
    """Perfil público de navegante. Se crea automáticamente con cada usuario."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        verbose_name=_("usuario"),
        on_delete=models.CASCADE,
        related_name="sailor_profile",
    )
    avatar = models.ImageField(_("foto de perfil"), upload_to="avatars/", blank=True)
    bio = models.TextField(_("sobre mí"), max_length=1000, blank=True)
    city = models.CharField(_("ciudad"), max_length=120, blank=True)
    region = models.ForeignKey(
        "geo.Region",
        verbose_name=_("región náutica"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sailors",
    )
    home_club = models.ForeignKey(
        "sailing.Club",
        verbose_name=_("club"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    experience_level = models.CharField(
        _("nivel de experiencia"), max_length=20, choices=ExperienceLevel.choices, blank=True
    )
    sailing_since = models.PositiveSmallIntegerField(
        _("navega desde (año)"),
        null=True,
        blank=True,
        validators=[MinValueValidator(1930)],
    )
    roles = models.JSONField(_("puestos a bordo"), default=list, blank=True, validators=[validate_roles])
    boat_classes = models.ManyToManyField(
        "sailing.BoatClass",
        verbose_name=_("clases que navega"),
        blank=True,
        related_name="sailors",
    )
    available_as_crew = models.BooleanField(_("disponible para tripular"), default=False)
    is_public = models.BooleanField(_("perfil público"), default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("perfil de navegante")
        verbose_name_plural = _("perfiles de navegante")

    def __str__(self):
        return str(self.user)

    def clean(self):
        if self.sailing_since and self.sailing_since > timezone.now().year:
            raise ValidationError({"sailing_since": _("El año no puede ser futuro.")})


class RaceResult(models.Model):
    """
    Resultado en una regata cargado por el navegante.
    Se puede vincular a una regata del calendario (y entonces aparece en su página);
    si la regata no está en MSAIL, se escribe como texto.
    """

    profile = models.ForeignKey(
        SailorProfile,
        verbose_name=_("perfil"),
        on_delete=models.CASCADE,
        related_name="results",
    )
    event = models.ForeignKey(
        "events.Event",
        verbose_name=_("regata del calendario"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sailor_results",
    )
    event_name = models.CharField(_("regata"), max_length=200)
    date = models.DateField(_("fecha"))
    location = models.CharField(_("lugar"), max_length=160, blank=True)
    boat_class = models.ForeignKey(
        "sailing.BoatClass",
        verbose_name=_("clase"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="results",
    )
    boat = models.ForeignKey(
        "boats.Boat",
        verbose_name=_("embarcación"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="results",
        help_text=_("Si se vincula, el resultado aparece en el historial de la embarcación."),
    )
    boat_name = models.CharField(_("barco"), max_length=120, blank=True)
    role = models.CharField(_("puesto"), max_length=20, choices=SailingRole.choices, blank=True)
    position = models.PositiveSmallIntegerField(_("puesto final"), validators=[MinValueValidator(1)])
    fleet_size = models.PositiveSmallIntegerField(
        _("barcos en la flota"),
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5000)],
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("resultado")
        verbose_name_plural = _("resultados")
        ordering = ["-date", "position"]

    def __str__(self):
        return f"{self.event_name} · {self.position}º"

    def clean(self):
        if self.fleet_size and self.position and self.position > self.fleet_size:
            raise ValidationError({"position": _("El puesto no puede ser mayor que la cantidad de barcos.")})
        if self.date and self.date > timezone.localdate():
            raise ValidationError({"date": _("La fecha no puede ser futura.")})


class ProfilePhoto(models.Model):
    """Foto de la galería del navegante (regatas, entrenamientos, tripulación)."""

    MAX_PER_PROFILE = 12

    profile = models.ForeignKey(SailorProfile, verbose_name=_("perfil"), on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(_("foto"), upload_to="sailors/")
    caption = models.CharField(_("descripción"), max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("foto del navegante")
        verbose_name_plural = _("fotos del navegante")
        ordering = ["-created_at"]

    def __str__(self):
        return self.caption or f"Foto {self.pk}"
