from django.contrib import admin
from django.shortcuts import redirect
from unfold.admin import ModelAdmin

from .models import RankingConfig


@admin.register(RankingConfig)
class RankingConfigAdmin(ModelAdmin):
    fieldsets = (
        (
            "Cómo se suman los puntos",
            {
                "fields": ("best_of", "min_fleet"),
                "description": "Cada resultado vale 100 × (flota − puesto + 1) ÷ flota, multiplicado por el coeficiente del "
                "nivel de la regata. Cada navegante suma sus mejores resultados de la temporada. "
                "El nivel de cada regata se elige en la regata (sección Ranking); la división (Abierta, Femenina, Sub-17…) "
                "y los barcos de la flota, en cada categoría.",
            },
        ),
        ("Coeficientes por nivel de regata", {"fields": ("coef_club", "coef_regional", "coef_national", "coef_continental", "coef_world")}),
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Hay una sola configuración: se abre directo.
        return redirect("admin:ranking_rankingconfig_change", RankingConfig.get().pk)
