"""
Ranking deportivo de MSAIL: se calcula solo con los resultados oficiales de las regatas (los que carga el equipo).
Cómo se calcula (ver scoring.py) y la configuración que se puede cambiar desde el panel.
"""

from decimal import Decimal

from django.db import models
from django.utils.translation import gettext_lazy as _


class RankingConfig(models.Model):
    """Configuración única del ranking (una sola fila, se edita desde el panel)."""

    best_of = models.PositiveSmallIntegerField(
        _("resultados que cuentan"), default=5, help_text=_("Se suman los mejores N resultados de cada temporada.")
    )
    min_fleet = models.PositiveSmallIntegerField(
        _("flota mínima"), default=5, help_text=_("Una clasificación con menos barcos no suma puntos.")
    )
    coef_club = models.DecimalField(_("coeficiente club"), max_digits=4, decimal_places=2, default=Decimal("1.00"))
    coef_regional = models.DecimalField(_("coeficiente regional"), max_digits=4, decimal_places=2, default=Decimal("1.25"))
    coef_national = models.DecimalField(_("coeficiente nacional"), max_digits=4, decimal_places=2, default=Decimal("1.50"))
    coef_continental = models.DecimalField(_("coeficiente continental"), max_digits=4, decimal_places=2, default=Decimal("2.00"))
    coef_world = models.DecimalField(_("coeficiente mundial"), max_digits=4, decimal_places=2, default=Decimal("3.00"))
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("configuración del ranking")
        verbose_name_plural = _("configuración del ranking")

    def __str__(self):
        return "Configuración del ranking"

    @classmethod
    def get(cls):
        config, _created = cls.objects.get_or_create(pk=1)
        return config

    def coefficient(self, level):
        return float(getattr(self, f"coef_{level}", 1) or 1)
