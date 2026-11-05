from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.core.text import normalize
from apps.geo.models import Located


class EventType(models.TextChoices):
    OFFSHORE = "offshore", _("Oceánica")
    INSHORE = "inshore", _("Costera")
    ONE_DESIGN = "one_design", _("Monotipo")
    OLYMPIC = "olympic", _("Clases olímpicas")
    MULTIHULL = "multihull", _("Multicasco")
    YOUTH = "youth", _("Juvenil")


class EventStatus(models.TextChoices):
    UPCOMING = "upcoming", _("Próxima")
    LIVE = "live", _("En curso")
    FINISHED = "finished", _("Finalizada")


class Event(Located):
    """Regata o campeonato del calendario internacional."""

    name = models.CharField(_("nombre"), max_length=200)
    slug = models.SlugField(_("slug"), max_length=200, unique=True)
    event_type = models.CharField(_("tipo"), max_length=20, choices=EventType.choices)
    start_date = models.DateField(_("inicio"))
    end_date = models.DateField(
        _("fin"), null=True, blank=True, help_text=_("Vacío si se conoce solo la largada (ej. regatas oceánicas).")
    )

    country = models.ForeignKey("geo.Country", verbose_name=_("país"), on_delete=models.PROTECT, related_name="events")
    region = models.ForeignKey(
        "geo.Region", verbose_name=_("región"), on_delete=models.SET_NULL, null=True, blank=True, related_name="events"
    )
    city = models.CharField(_("ciudad"), max_length=120, blank=True)
    venue = models.CharField(_("sede"), max_length=200, blank=True, help_text=_("Ej: Grand Harbour, Bahía de Palma"))

    organizer_club = models.ForeignKey(
        "sailing.Club",
        verbose_name=_("club organizador"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    organizer_name = models.CharField(
        _("organizador"), max_length=200, blank=True, help_text=_("Si el organizador no es un club cargado en MSAIL.")
    )
    boat_classes = models.ManyToManyField(
        "sailing.BoatClass", verbose_name=_("clases"), blank=True, related_name="events"
    )

    description = models.TextField(_("descripción"), blank=True)
    website = models.URLField(_("sitio oficial"), blank=True)
    entry_url = models.URLField(_("link de inscripción"), blank=True)
    entry_deadline = models.DateField(
        _("inscripción hasta"), null=True, blank=True, help_text=_("Último día para inscribirse. Vacío: hasta el inicio.")
    )
    is_published = models.BooleanField(_("publicada"), default=True)
    # Texto normalizado (sin tildes, en minúsculas) para el buscador. Se arma solo al guardar.
    search_text = models.TextField(editable=False, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("regata")
        verbose_name_plural = _("regatas")
        ordering = ["start_date", "name"]
        indexes = [models.Index(fields=["start_date"]), models.Index(fields=["event_type"])]

    def __str__(self):
        return self.name

    @property
    def last_day(self):
        return self.end_date or self.start_date

    @property
    def status(self):
        today = timezone.localdate()
        if today < self.start_date:
            return EventStatus.UPCOMING
        if today <= self.last_day:
            return EventStatus.LIVE
        return EventStatus.FINISHED

    @property
    def entries_open(self):
        """Hay link de inscripción y todavía se puede usar."""
        if not self.entry_url:
            return False
        today = timezone.localdate()
        limit = self.entry_deadline or self.start_date
        return today <= limit

    @property
    def organizer(self):
        return self.organizer_club.name if self.organizer_club_id else self.organizer_name

    def build_search_text(self):
        parts = [self.name, self.city, self.venue, self.organizer_name]
        if self.organizer_club_id:
            parts.append(self.organizer_club.name)
        if self.country_id:
            parts += [self.country.name_es, self.country.name_en, self.country.iso_code]
        if self.region_id:
            parts += [self.region.name_es, self.region.name_en]
        if self.pk:
            parts += list(self.boat_classes.values_list("name", flat=True))
        return normalize(" ".join(p for p in parts if p))

    def save(self, *args, **kwargs):
        self.search_text = self.build_search_text()
        super().save(*args, **kwargs)

    def clean(self):
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValidationError({"end_date": _("La fecha de fin no puede ser anterior al inicio.")})
        if self.region_id and self.country_id and self.region.country_id != self.country_id:
            raise ValidationError({"region": _("La región no pertenece al país elegido.")})


class EventCategory(models.Model):
    """División en la que se compite dentro de una regata (ej. "IRC General", "Doble mano", "Sub-21")."""

    event = models.ForeignKey(Event, verbose_name=_("regata"), on_delete=models.CASCADE, related_name="categories")
    name = models.CharField(_("nombre"), max_length=120)
    boat_class = models.ForeignKey(
        "sailing.BoatClass",
        verbose_name=_("clase"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="event_categories",
    )
    notes = models.CharField(_("detalle"), max_length=200, blank=True)
    order = models.PositiveSmallIntegerField(_("orden"), default=0)

    class Meta:
        verbose_name = _("categoría")
        verbose_name_plural = _("categorías")
        ordering = ["order", "name"]
        constraints = [models.UniqueConstraint(fields=["event", "name"], name="unique_category_per_event")]

    def __str__(self):
        return self.name


class DocumentKind(models.TextChoices):
    NOTICE_OF_RACE = "notice_of_race", _("Aviso de regata")
    SAILING_INSTRUCTIONS = "sailing_instructions", _("Instrucciones de regata")
    ENTRY_LIST = "entry_list", _("Lista de inscriptos")
    RESULTS = "results", _("Resultados")
    AMENDMENT = "amendment", _("Modificación / anexo")
    OTHER = "other", _("Otro")


PDF_MAX_MB = 20


class EventDocument(models.Model):
    """Documento oficial de una regata: un PDF subido al panel o un link al documento publicado por el organizador."""

    event = models.ForeignKey(Event, verbose_name=_("regata"), on_delete=models.CASCADE, related_name="documents")
    title = models.CharField(_("título"), max_length=200)
    kind = models.CharField(_("tipo"), max_length=30, choices=DocumentKind.choices, default=DocumentKind.OTHER)
    file = models.FileField(_("archivo PDF"), upload_to="event_documents/", blank=True)
    url = models.URLField(_("o link al documento"), blank=True)
    order = models.PositiveSmallIntegerField(_("orden"), default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("documento")
        verbose_name_plural = _("documentos")
        ordering = ["order", "created_at"]

    def __str__(self):
        return self.title

    def clean(self):
        if bool(self.file) == bool(self.url):
            raise ValidationError(_("Subí un PDF o pegá un link, uno de los dos."))
        if self.file and not getattr(self.file, "_committed", True):
            # Archivo recién subido: se valida que sea un PDF de verdad y su tamaño.
            if self.file.size > PDF_MAX_MB * 1024 * 1024:
                raise ValidationError({"file": _("El PDF supera los %(mb)s MB.") % {"mb": PDF_MAX_MB}})
            head = self.file.read(5)
            self.file.seek(0)
            if head != b"%PDF-":
                raise ValidationError({"file": _("El archivo no es un PDF.")})
