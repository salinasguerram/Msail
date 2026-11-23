from django.db import models
from django.utils.translation import gettext_lazy as _


class NotificationKind(models.TextChoices):
    RESULTS = "results", _("Resultados publicados")
    GALLERY = "gallery", _("Fotos nuevas")
    DATES = "dates", _("Cambio de fecha")
    STARTS = "starts", _("Empieza mañana")
    ENTRIES = "entries", _("Cierre de inscripciones")
    NEWS = "news", _("Noticia nueva")
    BERTH = "berth", _("Respuesta a solicitud de amarre")
    QUOTE = "quote", _("Respuesta a pedido de presupuesto")


class Notification(models.Model):
    """Aviso para un usuario. El texto se guarda ya escrito en su idioma."""

    user = models.ForeignKey("accounts.User", verbose_name=_("usuario"), on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(_("tipo"), max_length=20, choices=NotificationKind.choices)
    title = models.CharField(_("título"), max_length=200)
    body = models.CharField(_("texto"), max_length=300, blank=True)
    event = models.ForeignKey(
        "events.Event", verbose_name=_("regata"), on_delete=models.CASCADE, null=True, blank=True, related_name="notifications"
    )
    article = models.ForeignKey(
        "news.Article", verbose_name=_("noticia"), on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    # Evita avisar dos veces lo mismo (ej. "results:12" o "starts:12:2027-03-07").
    key = models.CharField(max_length=120)
    created_at = models.DateTimeField(_("fecha"), auto_now_add=True)
    read_at = models.DateTimeField(_("leído"), null=True, blank=True)
    emailed = models.BooleanField(_("enviado por email"), default=False)

    class Meta:
        verbose_name = _("aviso")
        verbose_name_plural = _("avisos")
        ordering = ["-created_at", "-id"]
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="unique_notification_key")]
        indexes = [models.Index(fields=["user", "read_at"])]

    def __str__(self):
        return self.title


class PushToken(models.Model):
    """Celular donde la persona inició sesión y aceptó los avisos push (ver push.py)."""

    user = models.ForeignKey("accounts.User", verbose_name=_("usuario"), on_delete=models.CASCADE, related_name="push_tokens")
    token = models.CharField(_("token de Expo"), max_length=200, unique=True)
    platform = models.CharField(_("sistema"), max_length=10, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("celular con avisos push")
        verbose_name_plural = _("celulares con avisos push")

    def __str__(self):
        return f"{self.user} · {self.platform or '?'}"
