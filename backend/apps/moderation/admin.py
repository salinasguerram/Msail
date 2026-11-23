from django.contrib import admin, messages
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html
from unfold.admin import ModelAdmin
from unfold.decorators import action, display

from apps.professionals.models import Review
from apps.profiles.models import SailorProfile

from .models import Block, Report, ReportStatus, TargetType


def pending_reports_badge(request):
    """Reportes sin revisar, para el menú lateral del panel."""
    count = Report.objects.filter(status=ReportStatus.PENDING).count()
    return str(count) if count else ""


@admin.register(Report)
class ReportAdmin(ModelAdmin):
    list_display = ["created_at", "target_type", "reason", "reported_user", "reporter", "status_badge"]
    list_filter = ["status", "target_type", "reason"]
    search_fields = ["reported_user__email", "reporter__email", "details"]
    readonly_fields = ["reporter", "target_type", "target_id", "reported_user", "reason", "details", "created_at", "handled_at", "content"]
    fields = ["content", "reason", "details", "reported_user", "reporter", "created_at", "status", "staff_note", "handled_at"]
    actions = ["hide_content", "dismiss"]

    def has_add_permission(self, request):
        return False

    @display(description="estado", label={"Pendiente": "warning", "Contenido ocultado": "success", "Descartado": "info"})
    def status_badge(self, report):
        return report.get_status_display()

    @display(description="contenido reportado")
    def content(self, report):
        if report.target_type == TargetType.REVIEW:
            review = Review.objects.filter(pk=report.target_id).select_related("professional").first()
            if not review:
                return "(la reseña ya no existe)"
            url = reverse("admin:professionals_review_change", args=[review.pk])
            return format_html('{}★ sobre {}: «{}» · <a href="{}">abrir la reseña</a>', review.rating, review.professional, review.comment or "(sin comentario)", url)
        profile = SailorProfile.objects.filter(user_id=report.target_id).first()
        if not profile:
            return "(el usuario ya no tiene perfil)"
        url = reverse("admin:profiles_sailorprofile_change", args=[profile.pk])
        return format_html('Perfil de {} · <a href="{}">abrir el perfil</a>', profile.user, url)

    @action(description="Ocultar el contenido reportado")
    def hide_content(self, request, queryset):
        count = 0
        for report in queryset:
            if report.target_type == TargetType.REVIEW:
                Review.objects.filter(pk=report.target_id).update(is_visible=False)
            else:
                # El perfil pasa a privado: deja de verse en Tripulaciones y en los perfiles públicos.
                SailorProfile.objects.filter(user_id=report.target_id).update(is_public=False, available_as_crew=False)
            report.status = ReportStatus.ACTIONED
            report.handled_at = timezone.now()
            report.save(update_fields=["status", "handled_at"])
            count += 1
        messages.success(request, f"Contenido ocultado en {count} reporte(s).")

    @action(description="Descartar (no hay nada que ocultar)")
    def dismiss(self, request, queryset):
        count = queryset.update(status=ReportStatus.DISMISSED, handled_at=timezone.now())
        messages.info(request, f"{count} reporte(s) descartado(s).")


@admin.register(Block)
class BlockAdmin(ModelAdmin):
    list_display = ["blocker", "blocked", "created_at"]
    search_fields = ["blocker__email", "blocked__email"]
    readonly_fields = ["blocker", "blocked", "created_at"]

    def has_add_permission(self, request):
        return False
