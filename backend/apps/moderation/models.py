"""
Moderación del contenido de los usuarios (lo piden App Store y Google Play en apps con perfiles y reseñas):

- Report: un usuario reporta un perfil o una reseña. Llega al panel (y por email al equipo, si está configurado)
  para revisarlo y, si corresponde, ocultar el contenido.
- Block: un usuario bloquea a otro. Desde ese momento no ven el perfil ni las reseñas del otro (en los dos sentidos).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _


class TargetType(models.TextChoices):
    USER = "user", _("Perfil de navegante")
    REVIEW = "review", _("Reseña")


class Reason(models.TextChoices):
    SPAM = "spam", _("Spam o publicidad")
    OFFENSIVE = "offensive", _("Ofensivo o acoso")
    FALSE = "false", _("Falso o engañoso")
    INAPPROPRIATE = "inappropriate", _("Fotos o contenido inapropiado")
    OTHER = "other", _("Otro motivo")


class ReportStatus(models.TextChoices):
    PENDING = "pending", _("Pendiente")
    ACTIONED = "actioned", _("Contenido ocultado")
    DISMISSED = "dismissed", _("Descartado")


class Report(models.Model):
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name=_("quién reporta"), on_delete=models.CASCADE, related_name="reports_made"
    )
    target_type = models.CharField(_("qué se reporta"), max_length=10, choices=TargetType.choices)
    target_id = models.PositiveIntegerField(_("id del contenido"))
    reported_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("usuario reportado"),
        on_delete=models.CASCADE,
        related_name="reports_received",
        null=True,
        blank=True,
    )
    reason = models.CharField(_("motivo"), max_length=15, choices=Reason.choices)
    details = models.TextField(_("detalle"), max_length=1000, blank=True)
    status = models.CharField(_("estado"), max_length=10, choices=ReportStatus.choices, default=ReportStatus.PENDING)
    staff_note = models.TextField(_("nota del equipo"), blank=True)
    created_at = models.DateTimeField(_("fecha"), auto_now_add=True)
    handled_at = models.DateTimeField(_("revisado el"), null=True, blank=True)

    class Meta:
        verbose_name = _("reporte")
        verbose_name_plural = _("reportes")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_target_type_display()} · {self.get_reason_display()}"


class Block(models.Model):
    blocker = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name=_("quién bloquea"), on_delete=models.CASCADE, related_name="blocks_made")
    blocked = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name=_("bloqueado"), on_delete=models.CASCADE, related_name="blocks_received")
    created_at = models.DateTimeField(_("fecha"), auto_now_add=True)

    class Meta:
        verbose_name = _("bloqueo")
        verbose_name_plural = _("bloqueos")
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["blocker", "blocked"], name="one_block_per_pair")]

    def __str__(self):
        return f"{self.blocker} → {self.blocked}"


def hidden_user_ids(user):
    """Usuarios cuyo contenido no ve `user`: los que bloqueó y los que lo bloquearon."""
    if not user or not user.is_authenticated:
        return set()
    pairs = Block.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list("blocker_id", "blocked_id")
    return {other for pair in pairs for other in pair if other != user.id}
