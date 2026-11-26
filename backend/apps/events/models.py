import re

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


class RankingLevel(models.TextChoices):
    """Importancia de la regata para el ranking: multiplica los puntos (los coeficientes se editan en el panel)."""

    CLUB = "club", _("Club")
    REGIONAL = "regional", _("Regional")
    NATIONAL = "national", _("Nacional")
    CONTINENTAL = "continental", _("Continental")
    WORLD = "world", _("Mundial")


class Division(models.TextChoices):
    """División de una categoría, para los rankings por edad y género."""

    OPEN = "open", _("Abierta")
    WOMEN = "women", _("Femenina")
    U15 = "u15", _("Sub-15")
    U17 = "u17", _("Sub-17")
    U19 = "u19", _("Sub-19")
    U21 = "u21", _("Sub-21")
    MASTER = "master", _("Master")


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

    professionals = models.ManyToManyField(
        "professionals.Professional",
        verbose_name=_("profesionales recomendados"),
        blank=True,
        related_name="events",
        help_text=_("Servicios para esta regata (velería, rigging, entrenadores…). Vacío: se muestran los más cercanos a la sede."),
    )

    cover = models.ImageField(
        _("foto de portada"), upload_to="events/", blank=True, help_text=_("La foto grande de la tarjeta en Eventos. Vacía: la primera de la galería.")
    )
    cover_thumb = models.ImageField(upload_to="events/thumbs/", blank=True, editable=False)

    description = models.TextField(_("descripción"), blank=True)
    website = models.URLField(_("sitio oficial"), blank=True)
    entry_url = models.URLField(_("link de inscripción"), blank=True)
    entry_deadline = models.DateField(
        _("inscripción hasta"), null=True, blank=True, help_text=_("Último día para inscribirse. Vacío: hasta el inicio.")
    )
    results_url = models.URLField(
        _("resultados oficiales"), blank=True, help_text=_("Link a la clasificación completa en el sitio del organizador.")
    )
    results_partial = models.BooleanField(
        _("resultados parciales"),
        default=False,
        help_text=_("Marcalo si solo están cargados los ganadores o el podio, no la clasificación completa."),
    )
    is_published = models.BooleanField(_("publicada"), default=True)
    ranking_level = models.CharField(
        _("nivel para el ranking"), max_length=12, choices=RankingLevel.choices, default=RankingLevel.NATIONAL
    )
    is_demo = models.BooleanField(
        _("datos de ejemplo"),
        default=False,
        help_text=_("Regata inventada para mostrar el ranking. No aparece en el calendario ni en el mapa; "
                    "se borran todas con «manage.py seed_demo_ranking --remove»."),
    )
    counts_for_ranking = models.BooleanField(
        _("suma para el ranking"), default=True, help_text=_("Desmarcalo para regatas de exhibición o con resultados incompletos.")
    )
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

    COVER_THUMB_SIDE = 640

    def save(self, *args, **kwargs):
        from apps.core.images import process_image

        if self.cover and not getattr(self.cover, "_committed", True):
            # Foto nueva: se recomprime sin datos GPS y se genera la miniatura para las tarjetas.
            self.cover.seek(0)
            original = self.cover.file
            self.cover = process_image(original)
            original.seek(0)
            self.cover_thumb = process_image(original, max_side=self.COVER_THUMB_SIDE)
        elif not self.cover and self.cover_thumb:
            self.cover_thumb = None
        self.search_text = self.build_search_text()
        super().save(*args, **kwargs)

    def clean(self):
        if self.cover and not getattr(self.cover, "_committed", True):
            from apps.core.images import process_image

            process_image(self.cover)  # valida que sea una imagen real
            self.cover.seek(0)
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
    fleet_size = models.PositiveSmallIntegerField(
        _("barcos en la flota"), null=True, blank=True,
        help_text=_("Cuántos barcos corrieron. Hace falta si solo cargaste el podio, para calcular los puntos del ranking."),
    )
    division = models.CharField(
        _("división (ranking)"), max_length=10, choices=Division.choices, default=Division.OPEN,
        help_text=_("Para los rankings por edad y género. La mayoría de las categorías son «Abierta»."),
    )
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


class ResultStatus(models.TextChoices):
    FINISHED = "finished", _("Terminó")
    DNF = "dnf", _("DNF · no terminó")
    DNS = "dns", _("DNS · no largó")
    RET = "ret", _("RET · se retiró")
    DSQ = "dsq", _("DSQ · descalificado")
    OCS = "ocs", _("OCS · largada anticipada")


class EventResult(models.Model):
    """Fila de la clasificación final de una regata (por categoría si la regata tiene varias)."""

    event = models.ForeignKey(Event, verbose_name=_("regata"), on_delete=models.CASCADE, related_name="results")
    category = models.ForeignKey(
        EventCategory,
        verbose_name=_("categoría"),
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="results",
        help_text=_("Vacío: clasificación general."),
    )
    position = models.PositiveSmallIntegerField(
        _("puesto"), null=True, blank=True, help_text=_("Vacío si no terminó (DNF, DNS, RET...).")
    )
    status = models.CharField(_("estado"), max_length=10, choices=ResultStatus.choices, default=ResultStatus.FINISHED)
    boat_name = models.CharField(_("barco"), max_length=120)
    sail_number = models.CharField(_("número de vela"), max_length=30, blank=True)
    skipper = models.CharField(_("timonel / armador"), max_length=160, blank=True)
    club = models.CharField(_("club"), max_length=160, blank=True)
    country = models.ForeignKey(
        "geo.Country", verbose_name=_("país"), on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    points = models.DecimalField(_("puntos"), max_digits=7, decimal_places=1, null=True, blank=True)
    time = models.CharField(_("tiempo"), max_length=40, blank=True, help_text=_("Ej: 2d 03:51:20 (tiempo real o corregido)."))
    boat = models.ForeignKey(
        "boats.Boat",
        verbose_name=_("embarcación en MSAIL"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="event_results",
        help_text=_("Si el barco está en MSAIL, se enlaza a su ficha."),
    )
    notes = models.CharField(_("nota"), max_length=200, blank=True, help_text=_("Ej: Primero en llegar (line honours)."))

    class Meta:
        verbose_name = _("resultado de la regata")
        verbose_name_plural = _("resultados de la regata")
        # Primero los que terminaron, por puesto; los DNF/DNS al final.
        ordering = ["category__order", "category__name", models.F("position").asc(nulls_last=True), "boat_name"]

    def __str__(self):
        return f"{self.position or self.get_status_display()} · {self.boat_name}"

    def clean(self):
        if self.category_id and self.event_id and self.category.event_id != self.event_id:
            raise ValidationError({"category": _("La categoría es de otra regata.")})
        if self.status == ResultStatus.FINISHED and not self.position:
            raise ValidationError({"position": _("Indicá el puesto, o cambiá el estado (DNF, DNS...).")})


class MediaKind(models.TextChoices):
    PHOTO = "photo", _("Foto")
    VIDEO = "video", _("Video")


VIDEO_PATTERNS = [
    # (proveedor, expresión que captura el id)
    ("youtube", re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/)([\w-]{11})")),
    ("vimeo", re.compile(r"vimeo\.com/(?:video/)?(\d+)")),
]


def parse_video_url(url):
    """Devuelve (proveedor, id) de un link de YouTube o Vimeo, o (None, None)."""
    for provider, pattern in VIDEO_PATTERNS:
        match = pattern.search(url or "")
        if match:
            return provider, match.group(1)
    return None, None


class EventMedia(models.Model):
    """Foto o video de la galería de una regata. Las fotos se suben al panel; los videos son links de YouTube o Vimeo."""

    THUMB_SIDE = 480

    event = models.ForeignKey(Event, verbose_name=_("regata"), on_delete=models.CASCADE, related_name="media")
    kind = models.CharField(_("tipo"), max_length=10, choices=MediaKind.choices, default=MediaKind.PHOTO)
    image = models.ImageField(
        _("foto"), upload_to="event_media/", blank=True, help_text=_("En los videos es opcional: se usa como portada.")
    )
    thumbnail = models.ImageField(upload_to="event_media/thumbs/", blank=True, editable=False)
    video_url = models.URLField(_("link del video"), blank=True, help_text=_("YouTube o Vimeo."))
    caption = models.CharField(_("descripción"), max_length=200, blank=True)
    credit = models.CharField(_("crédito"), max_length=120, blank=True, help_text=_("Fotógrafo o fuente. Ej: © Kurt Arrigo"))
    order = models.PositiveSmallIntegerField(_("orden"), default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("foto o video")
        verbose_name_plural = _("galería")
        ordering = ["order", "-created_at"]

    def __str__(self):
        return self.caption or f"{self.get_kind_display()} {self.pk}"

    @property
    def video(self):
        return parse_video_url(self.video_url)

    def clean(self):
        if self.kind == MediaKind.PHOTO:
            if not self.image:
                raise ValidationError({"image": _("Subí la foto.")})
            if self.video_url:
                raise ValidationError({"video_url": _("Las fotos no llevan link de video: elegí el tipo Video.")})
        else:
            if not self.video_url:
                raise ValidationError({"video_url": _("Pegá el link del video.")})
            if parse_video_url(self.video_url)[0] is None:
                raise ValidationError({"video_url": _("Por ahora solo se aceptan videos de YouTube o Vimeo.")})
        if self.image and not getattr(self.image, "_committed", True):
            # Valida que sea una imagen real (el procesado de verdad se hace al guardar).
            from apps.core.images import process_image

            process_image(self.image)
            self.image.seek(0)

    def save(self, *args, **kwargs):
        from apps.core.images import process_image

        if self.image and not getattr(self.image, "_committed", True):
            # Foto nueva: se recomprime (sin datos GPS) y se genera la miniatura para la grilla.
            self.image.seek(0)
            original = self.image.file
            self.image = process_image(original)
            original.seek(0)
            self.thumbnail = process_image(original, max_side=self.THUMB_SIDE, square=True)
        elif not self.image and self.thumbnail:
            self.thumbnail = None
        super().save(*args, **kwargs)


class EventFollow(models.Model):
    """Regata que un usuario sigue (favorita): recibe avisos de resultados, fechas y fotos."""

    user = models.ForeignKey("accounts.User", verbose_name=_("usuario"), on_delete=models.CASCADE, related_name="followed_events")
    event = models.ForeignKey(Event, verbose_name=_("regata"), on_delete=models.CASCADE, related_name="follows")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("seguidor")
        verbose_name_plural = _("seguidores")
        constraints = [models.UniqueConstraint(fields=["user", "event"], name="unique_event_follow")]

    def __str__(self):
        return f"{self.user} → {self.event}"


class RaceTrack(models.Model):
    """Una carrera de una regata con el recorrido GPS de cada barco, para verla repetida en la app."""

    event = models.ForeignKey(Event, verbose_name=_("regata"), on_delete=models.CASCADE, related_name="tracks")
    name = models.CharField(_("carrera"), max_length=120, help_text=_("Ej: Día 1 · Carrera 1"))
    order = models.PositiveSmallIntegerField(_("orden"), default=0)
    is_demo = models.BooleanField(
        _("datos de ejemplo"), default=False, help_text=_("Recorridos simulados para mostrar cómo se ve: la app lo avisa.")
    )
    is_published = models.BooleanField(_("publicada"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("track de carrera")
        verbose_name_plural = _("tracks de carreras")
        ordering = ["order", "created_at"]

    def __str__(self):
        return f"{self.event} · {self.name}"


class BoatTrack(models.Model):
    """El recorrido GPS de un barco en una carrera (de un archivo GPX)."""

    race = models.ForeignKey(RaceTrack, verbose_name=_("carrera"), on_delete=models.CASCADE, related_name="boats")
    boat_name = models.CharField(_("barco"), max_length=120)
    sail_number = models.CharField(_("número de vela"), max_length=30, blank=True)
    skipper = models.CharField(_("timonel / skipper"), max_length=120, blank=True)
    color = models.CharField(_("color"), max_length=7, blank=True, help_text=_("Vacío: se asigna uno automáticamente."))
    gpx = models.FileField(_("archivo GPX"), upload_to="event_tracks/", blank=True)
    # Puntos cada 5 s: [segundos UNIX, latitud, longitud]. Se arman al subir el GPX.
    points = models.JSONField(default=list, editable=False)

    class Meta:
        verbose_name = _("barco")
        verbose_name_plural = _("barcos")
        ordering = ["boat_name"]

    def __str__(self):
        return self.boat_name

    def clean(self):
        from .tracks import parse_gpx

        if self.gpx and not getattr(self.gpx, "_committed", True):
            self.points = parse_gpx(self.gpx)
            self.gpx.seek(0)
        elif not self.points and not self.gpx:
            raise ValidationError({"gpx": _("Subí el GPX con el recorrido del barco.")})

    def save(self, *args, **kwargs):
        from .tracks import BOAT_COLORS, parse_gpx

        if self.gpx and not getattr(self.gpx, "_committed", True):
            # GPX recién subido (también si reemplaza a otro): se leen sus puntos.
            self.points = parse_gpx(self.gpx)
            self.gpx.seek(0)
        if not self.color:
            used = self.race.boats.exclude(pk=self.pk).count() if self.race_id else 0
            self.color = BOAT_COLORS[used % len(BOAT_COLORS)]
        super().save(*args, **kwargs)
