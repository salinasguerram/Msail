from datetime import date

from django.conf import settings
from django import forms
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html
from django.utils.text import slugify
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import action, display

from apps.core.images import thumbnail_html

from . import results_import
from .models import Event, EventCategory, EventDocument, EventMedia, EventResult, EventStatus, MediaKind

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


class EventResultInline(TabularInline):
    model = EventResult
    extra = 0
    fields = ["category", "position", "status", "boat_name", "sail_number", "skipper", "club", "country", "points", "time", "boat", "notes"]
    autocomplete_fields = ["country", "boat"]
    classes = ["collapse"]
    verbose_name_plural = "clasificación (también se puede importar desde un CSV con el botón de arriba)"

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # En el selector de categoría, solo las de esta regata.
        if db_field.name == "category":
            event_id = request.resolver_match.kwargs.get("object_id")
            kwargs["queryset"] = EventCategory.objects.filter(event_id=event_id) if event_id else EventCategory.objects.none()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class EventMediaInline(TabularInline):
    model = EventMedia
    extra = 0
    fields = ["preview", "order", "kind", "image", "video_url", "caption", "credit"]
    readonly_fields = ["preview"]
    classes = ["collapse"]
    verbose_name_plural = "galería (para subir muchas fotos juntas usá el botón «Subir fotos» de arriba)"

    @admin.display(description="Vista previa")
    def preview(self, obj):
        return thumbnail_html(obj.thumbnail or obj.image) if obj and obj.pk else "—"


class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultiplePhotosField(forms.FileField):
    def clean(self, data, initial=None):
        files = data if isinstance(data, (list, tuple)) else [data]
        files = [f for f in files if f]
        if not files:
            raise forms.ValidationError("Elegí al menos una foto.")
        if len(files) > PHOTOS_PER_UPLOAD:
            raise forms.ValidationError(f"Podés subir hasta {PHOTOS_PER_UPLOAD} fotos por vez.")
        return files


PHOTOS_PER_UPLOAD = 30


class PhotosUploadForm(forms.Form):
    photos = MultiplePhotosField(
        label="Fotos",
        widget=MultipleFileInput(attrs={"accept": "image/jpeg,image/png,image/webp", "multiple": True}),
        help_text=f"JPG, PNG o WEBP. Hasta {PHOTOS_PER_UPLOAD} por vez. Se les quitan los datos de ubicación.",
    )
    credit = forms.CharField(label="Crédito", max_length=120, required=False, help_text="Fotógrafo o fuente, para todas las fotos.")
    caption = forms.CharField(label="Descripción", max_length=200, required=False, help_text="Opcional, la misma para todas.")


class ResultsImportForm(forms.Form):
    file = forms.FileField(label="Archivo CSV", help_text="Exportado desde Excel, Sailwave, Manage2Sail... Máximo 2 MB.")
    category = forms.ModelChoiceField(
        label="Categoría",
        queryset=EventCategory.objects.none(),
        required=False,
        empty_label="General / la que diga cada fila",
        help_text="Para las filas que no traen la columna categoría.",
    )
    replace = forms.BooleanField(
        label="Reemplazar la clasificación de esas categorías",
        initial=True,
        required=False,
        help_text="Si lo desmarcás, las filas se suman a las que ya hay.",
    )

    def __init__(self, *args, event, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["category"].queryset = event.categories.all()

    def clean_file(self):
        upload = self.cleaned_data["file"]
        if upload.size > 2 * 1024 * 1024:
            raise forms.ValidationError("El archivo supera los 2 MB.")
        return upload


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
    autocomplete_fields = ["country", "region", "organizer_club", "professionals"]
    filter_horizontal = ["boat_classes"]
    date_hierarchy = "start_date"
    ordering = ["-start_date"]
    inlines = [EventCategoryInline, EventDocumentInline, EventResultInline, EventMediaInline]
    readonly_fields = ["app_link"]
    actions = ["publish", "unpublish", "duplicate_next_year"]
    actions_detail = ["upload_photos_action", "import_results_action"]
    fieldsets = (
        (None, {"fields": ("name", "slug", "event_type", "is_published", "app_link")}),
        ("Fechas", {"fields": ("start_date", "end_date")}),
        ("Lugar", {"fields": ("country", "region", "city", "venue", "latitude", "longitude")}),
        ("Organización", {"fields": ("organizer_club", "organizer_name", "boat_classes")}),
        ("Servicios", {"fields": ("professionals",), "description": "Profesionales que se muestran en la página de la regata."}),
        ("Inscripción", {"fields": ("entry_url", "entry_deadline")}),
        ("Información", {"fields": ("cover", "description", "website")}),
        ("Resultados", {"fields": ("results_url", "results_partial")}),
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

    # ---------- Importar la clasificación desde un CSV

    def get_urls(self):
        custom = [
            path(
                "results-template.csv",
                self.admin_site.admin_view(self.results_template_view),
                name="events_event_results_template",
            ),
        ]
        return custom + super().get_urls()

    def results_template_view(self, request):
        response = HttpResponse("﻿" + results_import.TEMPLATE, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="plantilla-resultados.csv"'
        return response

    @action(description="Importar resultados (CSV)", url_path="import-results", icon="upload_file", permissions=["change"])
    def import_results_action(self, request, object_id):
        event = get_object_or_404(Event, pk=object_id)
        form = ResultsImportForm(request.POST or None, request.FILES or None, event=event)
        errors = []
        if request.method == "POST" and form.is_valid():
            try:
                rows, errors = results_import.parse_csv(form.cleaned_data["file"].read())
            except results_import.ResultsImportError as exc:
                form.add_error("file", str(exc))
            else:
                if not errors:
                    count, new_categories = results_import.import_results(
                        event, rows, default_category=form.cleaned_data["category"], replace=form.cleaned_data["replace"]
                    )
                    message = f"Se importaron {count} resultados en {event.name}."
                    if new_categories:
                        message += f" Categorías nuevas: {', '.join(new_categories)}."
                    self.message_user(request, message, messages.SUCCESS)
                    return redirect(reverse("admin:events_event_change", args=[event.pk]))
        context = {
            **self.admin_site.each_context(request),
            "title": f"Importar resultados · {event.name}",
            "opts": self.model._meta,
            "original": event,
            "form": form,
            "row_errors": errors,
            "columns": [(EventResult._meta.get_field(f).verbose_name, a) for f, a in results_import.HEADERS.items()],
            "template_url": reverse("admin:events_event_results_template"),
            "change_url": reverse("admin:events_event_change", args=[event.pk]),
        }
        return TemplateResponse(request, "admin/events/import_results.html", context)

    # ---------- Subir varias fotos a la galería

    @action(description="Subir fotos", url_path="upload-photos", icon="add_photo_alternate", permissions=["change"])
    def upload_photos_action(self, request, object_id):
        event = get_object_or_404(Event, pk=object_id)
        form = PhotosUploadForm(request.POST or None, request.FILES or None)
        rejected = []
        if request.method == "POST" and form.is_valid():
            last = event.media.order_by("-order").values_list("order", flat=True).first() or 0
            saved = 0
            for upload in form.cleaned_data["photos"]:
                media = EventMedia(
                    event=event,
                    kind=MediaKind.PHOTO,
                    image=upload,
                    caption=form.cleaned_data["caption"],
                    credit=form.cleaned_data["credit"],
                    order=last + saved + 1,
                )
                try:
                    media.full_clean()
                    media.save()
                    saved += 1
                except ValidationError as exc:
                    rejected.append(f"{upload.name}: {' '.join(exc.messages)}")
            if saved:
                self.message_user(request, f"Se subieron {saved} foto(s) a la galería de {event.name}.", messages.SUCCESS)
            if not rejected:
                return redirect(reverse("admin:events_event_change", args=[event.pk]))
        context = {
            **self.admin_site.each_context(request),
            "title": f"Subir fotos · {event.name}",
            "opts": self.model._meta,
            "original": event,
            "form": form,
            "rejected": rejected,
            "photo_count": event.media.filter(kind=MediaKind.PHOTO).count(),
            "change_url": reverse("admin:events_event_change", args=[event.pk]),
        }
        return TemplateResponse(request, "admin/events/upload_photos.html", context)
