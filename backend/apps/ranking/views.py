from datetime import date

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Division, RankingLevel

from . import scoring
from .models import RankingConfig


def _season(request):
    try:
        return int(request.query_params.get("season") or date.today().year)
    except ValueError:
        return date.today().year


class RankingOptionsView(APIView):
    """Temporadas, clases con resultados (con sus divisiones) y países, para armar los filtros de la pantalla."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        seasons = scoring.seasons()
        season = _season(request)
        if seasons and season not in seasons and "season" not in request.query_params:
            season = seasons[0]  # si este año todavía no hay resultados, la última temporada con datos
        config = RankingConfig.get()
        return Response(
            {
                "season": season,
                "seasons": seasons,
                **scoring.options(season),
                "rules": {
                    "best_of": config.best_of,
                    "min_fleet": config.min_fleet,
                    "levels": [{"key": level.value, "coefficient": config.coefficient(level.value)} for level in RankingLevel],
                },
            }
        )


class RankingView(APIView):
    """Tabla de una clase: ?season=2026&class=ilca-7&division=open&country=AR"""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        boat_class = (request.query_params.get("class") or "").strip()
        if not boat_class:
            return Response({"class": ["Elegí una clase."]}, status=400)
        division = request.query_params.get("division") or Division.OPEN
        if division not in Division.values:
            division = Division.OPEN
        country = (request.query_params.get("country") or "").strip().upper() or None
        season = _season(request)
        return Response(
            {
                "season": season,
                "class": boat_class,
                "division": division,
                "country": country,
                "entries": scoring.with_movement(season, boat_class, division, country),
            }
        )
