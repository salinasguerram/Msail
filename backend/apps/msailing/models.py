"""
MSailing: la sección institucional de la marca dentro de la app.
- Secciones de texto (Quiénes somos, Escuela de vela y formación, La Fundación), en español e inglés.
- Videos, tips y lecciones (contenido educativo), por clase de embarcación. Algunos son gratis y otros exclusivos de
  MSAIL Premium: a quien no es Premium se le muestra el título y la descripción, pero no el video ni la lección.
- La Fundación: los aportes solidarios a deportistas (a quién, para qué y cuánto), para mostrar el destino de los fondos.
Todo se edita desde el panel de administración.
"""

import re

from django.db import models
from django.utils.translation import get_language
from django.utils.translation import gettext_lazy as _

from apps.marinas.models import CURRENCIES


def _english():
    return (get_language() or "es").startswith("en")


class SectionKey(models.TextChoices):
    ABOUT = "about", _("Quiénes somos")
    SCHOOL = "school", _("Escuela de vela y formación")
    FOUNDATION = "foundation", _("La Fundación")


class Section(models.Model):
    """Texto de una parte de la página MSailing. Hay una por clave."""

    key = models.CharField(_("sección"), max_length=20, choices=SectionKey.choices, unique=True)
    title_es = models.CharField(_("título (español)"), max_length=120)
    title_en = models.CharField(_("título (inglés)"), max_length=120, blank=True)
    body_es = models.TextField(_("texto (español)"), help_text=_("Párrafos separados por una línea en blanco."))
    body_en = models.TextField(_("texto (inglés)"), blank=True, help_text=_("Vacío: se muestra el texto en español."))
    image = models.ImageField(_("imagen"), upload_to="msailing/", blank=True)
    cta_label_es = models.CharField(_("botón (español)"), max_length=60, blank=True, help_text=_("Ej: Quiero colaborar"))
    cta_label_en = models.CharField(_("botón (inglés)"), max_length=60, blank=True)
    cta_url = models.CharField(
        _("link del botón"), max_length=300, blank=True, help_text=_("Una web (https://…) o un email (mailto:fundacion@…).")
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("sección")
        verbose_name_plural = _("secciones")
        ordering = ["key"]

    def __str__(self):
        return self.get_key_display()

    @property
    def title(self):
        return self.title_en if _english() and self.title_en else self.title_es

    @property
    def body(self):
        return self.body_en if _english() and self.body_en else self.body_es

    @property
    def cta_label(self):
        return self.cta_label_en if _english() and self.cta_label_en else self.cta_label_es


class VideoKind(models.TextChoices):
    VIDEO = "video", _("Video")
    TIP = "tip", _("Tip náutico")
    LESSON = "lesson", _("Lección")


class Level(models.TextChoices):
    ALL = "all", _("Para todos")
    BEGINNER = "beginner", _("Iniciación")
    INTERMEDIATE = "intermediate", _("Intermedio")
    ADVANCED = "advanced", _("Avanzado")


YOUTUBE_ID = re.compile(r"(?:youtube\.com/(?:watch\?v=|shorts/|embed/)|youtu\.be/)([\w-]{11})")


class Video(models.Model):
    """Contenido educativo: un video, un tip o una lección escrita (con o sin video)."""

    title = models.CharField(_("título"), max_length=160)
    description = models.TextField(_("descripción"), blank=True, help_text=_("Se ve siempre, aunque el contenido sea Premium."))
    url = models.URLField(_("link del video"), blank=True, help_text=_("YouTube, Vimeo, Instagram…"))
    body = models.TextField(
        _("texto de la lección"), blank=True, help_text=_("Para las lecciones. Párrafos separados por una línea en blanco.")
    )
    kind = models.CharField(_("tipo"), max_length=10, choices=VideoKind.choices, default=VideoKind.VIDEO)
    boat_classes = models.ManyToManyField(
        "sailing.BoatClass",
        verbose_name=_("clases de embarcación"),
        blank=True,
        related_name="videos",
        help_text=_("Vacío: sirve para cualquier clase."),
    )
    level = models.CharField(_("nivel"), max_length=12, choices=Level.choices, default=Level.ALL)
    is_premium = models.BooleanField(
        _("exclusivo Premium"), default=False, help_text=_("Solo lo ven completo los suscriptores de MSAIL Premium.")
    )
    views = models.PositiveIntegerField(_("vistas"), default=0, editable=False)
    language = models.CharField(_("idioma"), max_length=2, choices=[("es", _("Español")), ("en", _("Inglés"))], default="es")
    order = models.PositiveSmallIntegerField(_("orden"), default=0)
    is_published = models.BooleanField(_("publicado"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("video o lección")
        verbose_name_plural = _("videos y lecciones")
        ordering = ["order", "-created_at"]

    def __str__(self):
        return self.title

    def clean(self):
        from django.core.exceptions import ValidationError

        if not self.url and not self.body.strip():
            raise ValidationError(_("Poné el link del video o el texto de la lección."))

    @property
    def thumbnail(self):
        """Miniatura de YouTube (sin pedir nada a YouTube). None en otras plataformas."""
        match = YOUTUBE_ID.search(self.url or "")
        return f"https://img.youtube.com/vi/{match.group(1)}/hqdefault.jpg" if match else None


class FoundationSupport(models.Model):
    """Un aporte de la Fundación: a quién se apoyó, para qué y cuánto. Así se muestra el destino de los fondos."""

    beneficiary = models.CharField(_("deportista o equipo"), max_length=160)
    purpose = models.CharField(_("destino"), max_length=200, help_text=_("Ej: Viaje al Mundial de ILCA 6."))
    description = models.TextField(_("detalle"), blank=True)
    amount = models.DecimalField(_("importe"), max_digits=10, decimal_places=2, null=True, blank=True)
    currency = models.CharField(_("moneda"), max_length=3, choices=CURRENCIES, default="USD")
    date = models.DateField(_("fecha"))
    photo = models.ImageField(_("foto"), upload_to="msailing/foundation/", blank=True)
    is_published = models.BooleanField(_("publicado"), default=True)

    class Meta:
        verbose_name = _("aporte de la Fundación")
        verbose_name_plural = _("aportes de la Fundación")
        ordering = ["-date"]

    def __str__(self):
        return f"{self.beneficiary} · {self.purpose}"
