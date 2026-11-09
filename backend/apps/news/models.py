from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.core.text import normalize


class Highlight(models.TextChoices):
    NONE = "", _("Normal")
    DAY = "day", _("Portada del día")
    WEEK = "week", _("Destacada de la semana")


class Article(models.Model):
    """Noticia de vela. Se escribe en el panel; puede quedar programada para publicarse más tarde."""

    COVER_THUMB_SIDE = 640

    title = models.CharField(_("título"), max_length=200)
    slug = models.SlugField(_("slug"), max_length=200, unique=True)
    summary = models.CharField(_("bajada"), max_length=300, help_text=_("Una o dos líneas que resumen la noticia."))
    body = models.TextField(
        _("texto"),
        help_text=_(
            "Separá los párrafos con una línea en blanco. Para un subtítulo empezá la línea con «## »; "
            "para una cita, con «> »."
        ),
    )
    cover = models.ImageField(_("foto de portada"), upload_to="news/", blank=True)
    cover_thumb = models.ImageField(upload_to="news/thumbs/", blank=True, editable=False)
    cover_credit = models.CharField(_("crédito de la foto"), max_length=120, blank=True)
    author = models.CharField(_("autor"), max_length=120, blank=True, default="Redacción MSAIL")
    source_name = models.CharField(_("fuente"), max_length=120, blank=True, help_text=_("Si la noticia se basa en otro medio."))
    source_url = models.URLField(_("link a la fuente"), blank=True)

    highlight = models.CharField(
        _("destacada"),
        max_length=10,
        choices=Highlight.choices,
        blank=True,
        default="",
        help_text=_("Portada del día: la noticia principal. Semana: aparece entre las destacadas de los últimos 7 días."),
    )
    # Para los filtros (país, clase, campeonato).
    country = models.ForeignKey("geo.Country", verbose_name=_("país"), on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    boat_classes = models.ManyToManyField("sailing.BoatClass", verbose_name=_("clases"), blank=True, related_name="articles")
    event = models.ForeignKey(
        "events.Event", verbose_name=_("regata / campeonato"), on_delete=models.SET_NULL, null=True, blank=True, related_name="articles"
    )

    is_published = models.BooleanField(_("publicada"), default=True)
    # Ya se avisó a quienes siguen la regata de la noticia (se avisa una vez, al quedar visible).
    followers_notified = models.BooleanField(default=False, editable=False)
    published_at = models.DateTimeField(
        _("fecha de publicación"), default=timezone.now, help_text=_("Si es futura, la noticia aparece recién en ese momento.")
    )
    views = models.PositiveIntegerField(_("lecturas"), default=0, editable=False)
    # Título, bajada, texto, país, regata y clases sin tildes, para el buscador. Se arma solo al guardar.
    search_text = models.TextField(editable=False, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("noticia")
        verbose_name_plural = _("noticias")
        ordering = ["-published_at", "-id"]
        indexes = [models.Index(fields=["-published_at"]), models.Index(fields=["highlight", "-published_at"])]

    def __str__(self):
        return self.title

    @classmethod
    def visible(cls):
        """Publicadas y con la fecha de publicación ya cumplida."""
        return cls.objects.filter(is_published=True, published_at__lte=timezone.now())

    @property
    def blocks(self):
        """El texto en bloques para la app: [{"type": "paragraph" | "heading" | "quote", "text": ...}]."""
        result = []
        for chunk in self.body.replace("\r\n", "\n").split("\n\n"):
            chunk = chunk.strip()
            if not chunk:
                continue
            if chunk.startswith("## "):
                result.append({"type": "heading", "text": chunk[3:].strip()})
            elif chunk.startswith(">"):
                lines = [line.lstrip(">").strip() for line in chunk.split("\n")]
                result.append({"type": "quote", "text": " ".join(line for line in lines if line)})
            else:
                result.append({"type": "paragraph", "text": " ".join(line.strip() for line in chunk.split("\n"))})
        return result

    @property
    def is_visible(self):
        return self.is_published and self.published_at <= timezone.now()

    @property
    def reading_minutes(self):
        return max(1, round(len(self.body.split()) / 200))

    def build_search_text(self):
        parts = [self.title, self.summary, self.body, self.author]
        if self.country_id:
            parts += [self.country.name_es, self.country.name_en, self.country.iso_code]
        if self.event_id:
            parts.append(self.event.name)
        if self.pk:
            parts += list(self.boat_classes.values_list("name", flat=True))
        return normalize(" ".join(p for p in parts if p))

    def add_view(self):
        type(self).objects.filter(pk=self.pk).update(views=F("views") + 1)

    def clean(self):
        if self.cover and not getattr(self.cover, "_committed", True):
            from apps.core.images import process_image

            process_image(self.cover)  # valida que sea una imagen real
            self.cover.seek(0)
        if self.source_url and not self.source_name:
            raise ValidationError({"source_name": _("Indicá el nombre del medio de la fuente.")})

    def save(self, *args, **kwargs):
        from apps.core.images import process_image

        if self.cover and not getattr(self.cover, "_committed", True):
            # Foto nueva: se recomprime sin datos GPS y se genera la miniatura para los listados.
            self.cover.seek(0)
            original = self.cover.file
            self.cover = process_image(original)
            original.seek(0)
            thumb = process_image(original, max_side=self.COVER_THUMB_SIDE)
            self.cover_thumb = thumb
        elif not self.cover and self.cover_thumb:
            self.cover_thumb = None
        self.search_text = self.build_search_text()
        super().save(*args, **kwargs)
