from datetime import date

from django.conf import settings
from django.contrib import admin, messages
from django.db import transaction
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.html import format_html
from django.utils.text import slugify
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import display

from .models import Event, EventCategory, EventDocument, EventStatus

STATUS_LABELS = {
    EventStatus.UPCOMING: "Próxima",
    EventStatus.LIVE: "En curso",
    EventStatus.FINISHED: "Finalizada",
}


class EventCategoryInline(TabularInline):
    model = EventCategory
    extra = 0
    fields = ["order", "name", "boat_class", "notes"]
    autocomplete_fields = ["boat_class"]


class EventDocumentInline(TabularInline):
    model = EventDocument
    extra = 0
    fields = ["order", "title", "kind", "file", "url", "open_link"]
    readonly_fields = ["open_link"]

    @admin.display(description="Ver")
    def open_link(self, obj):
        target = obj.file.url if obj and obj.file else (obj.url if obj else "")
        return format_html('<a href="{}" target="_blank" rel="noopener">Abrir</a>', target) if target else "—"


class StatusFilter(admin.SimpleListFilter):
    title = "estado"
    parameter_name = "estado"

    def lookups(self, request, model_admin):
        return [("upcoming", "Próximas"), ("live", "En curso"), ("finished", "Finalizadas")]

    def queryset(self, request, queryset):
        today = timezone.localdate()
        queryset = queryset.annotate(ends_on=Coalesce("end_date", "start_date"))
        if self.value() == "upcoming":
            return queryset.filter(start_date__gt=today)
        if self.value() == "live":
            return queryset.filter(start_date__lte=today, ends_on__gte=today)
        if self.value() == "finished":
            return queryset.filter(ends_on__lt=today)
        return queryset


def next_year(value):
    if value is None:
        return None
    try:
        return value.replace(year=value.year + 1)
    except ValueError:  # 29 de febrero
        return date(value.year + 1, 2, 28)


@admin.register(Event)
class EventAdmin(ModelAdmin):
    list_display = ["name", "start_date", "end_date", "status_label", "event_type", "country", "organizer_display", "is_published"]
    list_filter = [StatusFilter, "event_type", "is_published", "country", "boat_classes"]
    search_fields = ["name", "city", "venue", "organizer_name", "organizer_club__name"]
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["country", "region", "organizer_club"]
    filter_horizontal = ["boat_classes"]
    date_hierarchy = "start_date"
    ordering = ["-start_date"]
    inlines = [EventCategoryInline, EventDocumentInline]
    readonly_fields = ["app_link"]
    actions = ["publish", "unpublish", "duplicate_next_year"]
    fieldsets = (
        (None, {"fields": ("name", "slug", "event_type", "is_published", "app_link")}),
        ("Fechas", {"fields": ("start_date", "end_date")}),
        ("Lugar", {"fields": ("country", "region", "city", "venue", "latitude", "longitude")}),
        ("Organización", {"fields": ("organizer_club", "organizer_name", "boat_classes")}),
        ("Inscripción", {"fields": ("entry_url", "entry_deadline")}),
        ("Información", {"fields": ("description", "website")}),
    )

    @display(description="Estado", label={"Próxima": "info", "En curso": "success", "Finalizada": "warning"})
    def status_label(self, obj):
        return STATUS_LABELS[obj.status]

    @admin.display(description="Organizador")
    def organizer_display(self, obj):
        return obj.organizer

    @admin.display(description="En la app")
    def app_link(self, obj):
        if not obj or not obj.pk:
            return "Se genera al guardar."
        url = f"{settings.FRONTEND_URL.rstrip('/')}/events/{obj.slug}"
        return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', url, url)

    @admin.action(description="Publicar (se ven en la app)", permissions=["change"])
    def publish(self, request, queryset):
        updated = queryset.filter(is_published=False).update(is_published=True)
        self.message_user(request, f"{updated} regata(s) publicadas.", messages.SUCCESS)

    @admin.action(description="Ocultar de la app", permissions=["change"])
    def unpublish(self, request, queryset):
        updated = queryset.filter(is_published=True).update(is_published=False)
        self.message_user(request, f"{updated} regata(s) ocultadas.", messages.SUCCESS)

    @admin.action(description="Duplicar para el año siguiente (sin publicar)", permissions=["add"])
    @transaction.atomic
    def duplicate_next_year(self, request, queryset):
        """Copia datos, clases y categorías con las fechas un año después. Los documentos no se copian."""
        created, skipped = 0, []
        for event in queryset.prefetch_related("boat_classes", "categories"):
            year = event.start_date.year
            name = event.name.replace(str(year), str(year + 1)) if str(year) in event.name else f"{event.name} {year + 1}"
            slug = slugify(name)
            if Event.objects.filter(slug=slug).exists():
                skipped.append(name)
                continue
            copy = Event.objects.create(
                name=name,
                slug=slug,
                event_type=event.event_type,
                start_date=next_year(event.start_date),
                end_date=next_year(event.end_date),
                country=event.country,
                region=event.region,
                city=event.city,
                venue=event.venue,
                latitude=event.latitude,
                longitude=event.longitude,
                organizer_club=event.organizer_club,
                organizer_name=event.organizer_name,
                description=event.description,
                website=event.website,
                is_published=False,  # se revisan las fechas antes de publicar
            )
            copy.boat_classes.set(event.boat_classes.all())
            EventCategory.objects.bulk_create(
                EventCategory(event=copy, name=c.name, boat_class=c.boat_class, notes=c.notes, order=c.order)
                for c in event.categories.all()
            )
            created += 1
        if created:
            self.message_user(request, f"{created} regata(s) duplicadas sin publicar: revisá las fechas y publicalas.", messages.SUCCESS)
        if skipped:
            self.message_user(request, f"Ya existían: {', '.join(skipped)}.", messages.WARNING)
