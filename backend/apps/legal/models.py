"""
Textos legales de MSAIL: política de privacidad y términos y condiciones, en español e inglés.

Las tiendas (App Store y Google Play) piden un link público a la política de privacidad; la app los muestra en
/legal/privacy y /legal/terms. Se editan desde el panel. En el texto, {contacto} se reemplaza por el email de
contacto (LEGAL_CONTACT_EMAIL), así no hay que cambiarlo en cada lugar.
"""

from django.conf import settings
from django.db import models
from django.utils.translation import get_language
from django.utils.translation import gettext_lazy as _


def _english():
    return (get_language() or "es").startswith("en")


class LegalKey(models.TextChoices):
    PRIVACY = "privacy", _("Política de privacidad")
    TERMS = "terms", _("Términos y condiciones")


class LegalPage(models.Model):
    key = models.CharField(_("documento"), max_length=20, choices=LegalKey.choices, unique=True)
    title_es = models.CharField(_("título (español)"), max_length=120)
    title_en = models.CharField(_("título (inglés)"), max_length=120, blank=True)
    body_es = models.TextField(
        _("texto (español)"),
        help_text=_("Párrafos separados por una línea en blanco. Una línea que empieza con «## » es un subtítulo. "
                    "{contacto} se reemplaza por el email de contacto."),
    )
    body_en = models.TextField(_("texto (inglés)"), blank=True, help_text=_("Vacío: se muestra el texto en español."))
    updated_at = models.DateTimeField(_("última actualización"), auto_now=True)

    class Meta:
        verbose_name = _("texto legal")
        verbose_name_plural = _("textos legales")
        ordering = ["key"]

    def __str__(self):
        return self.get_key_display()

    @property
    def title(self):
        return self.title_en if _english() and self.title_en else self.title_es

    @property
    def body(self):
        text = self.body_en if _english() and self.body_en.strip() else self.body_es
        return text.replace("{contacto}", settings.LEGAL_CONTACT_EMAIL)
