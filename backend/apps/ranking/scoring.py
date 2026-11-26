"""
Cálculo del ranking.

1. Cada clasificación oficial de una regata (la general o una categoría) pertenece a una clase de embarcación
   (la de la categoría, o la única clase de la regata) y a una división (Abierta, Femenina, Sub-17...).
2. Puntos por resultado: 100 × (flota − puesto + 1) ÷ flota, multiplicado por el nivel de la regata
   (club, regional, nacional, continental, mundial). Ganar en una flota grande suma más que en una chica.
   Quien no terminó (DNF, DNS, RET...) no suma. Una clasificación con menos barcos que la flota mínima no cuenta.
3. Cada competidor (identificado por clase + número de vela, o el nombre si no hay número) suma sus mejores
   N resultados de la temporada (año calendario de la regata).
4. «Movimiento»: el puesto de hoy comparado con el de hace 30 días.
"""

import hashlib
import re
import unicodedata
from datetime import date, timedelta

from django.core.cache import cache
from django.db.models import Count, Max, Q

from apps.events.models import Division, Event, EventResult, ResultStatus

from .models import RankingConfig

CACHE_SECONDS = 60 * 30
MOVEMENT_DAYS = 30


def _version():
    """
    Huella de los datos: cambia cuando se edita una regata, se cargan o borran resultados o se cambia la configuración.
    Va en la clave de la caché, así el ranking se recalcula solo (también en Vercel, donde cada servidor tiene su caché).
    """
    # Los cambios masivos del panel (publicar, ocultar) no tocan updated_at: por eso también cuenta cuántas suman.
    stamp = Event.objects.aggregate(
        updated=Max("updated_at"), counting=Count("id", filter=Q(is_published=True, counts_for_ranking=True))
    )
    results = EventResult.objects.aggregate(count=Count("id"), last=Max("id"))
    config = RankingConfig.objects.aggregate(updated=Max("updated_at"))["updated"]
    raw = f"{stamp['updated']}|{stamp['counting']}|{results['count']}|{results['last']}|{config}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def _normalize(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def competitor_key(class_slug, result):
    sail = _normalize(result.sail_number)
    if sail:
        return f"{class_slug}:vela:{sail}"
    return f"{class_slug}:nombre:{_normalize(result.skipper or result.boat_name)}"


def _season_events(season, cutoff):
    """Regatas terminadas de la temporada que suman para el ranking, con su clase si tienen una sola."""
    events = (
        Event.objects.filter(is_published=True, counts_for_ranking=True)
        .annotate(classes=Count("boat_classes", distinct=True))
        .prefetch_related("boat_classes", "categories__boat_class")
    )
    chosen = []
    for event in events:
        ends = event.end_date or event.start_date
        if ends.year == season and ends <= cutoff:
            chosen.append(event)
    return chosen


def score_rows(season, cutoff=None):
    """Todos los resultados que suman de la temporada, ya con sus puntos. Se guarda en caché."""
    cutoff = cutoff or date.today()
    key = f"ranking:{_version()}:{season}:{cutoff.isoformat()}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    config = RankingConfig.get()
    events = _season_events(season, cutoff)
    results = (
        EventResult.objects.filter(event__in=events)
        .select_related("category__boat_class", "country", "boat__owner__sailor_profile")
        .order_by()
    )
    groups = {}
    for result in results:
        groups.setdefault((result.event_id, result.category_id), []).append(result)

    by_id = {e.pk: e for e in events}
    rows = []
    for (event_id, _category_id), group in groups.items():
        event = by_id[event_id]
        category = group[0].category
        if category and category.boat_class:
            boat_class = category.boat_class
        elif event.classes == 1:
            boat_class = next(iter(event.boat_classes.all()))
        else:
            continue  # clasificación sin clase (ej. "Primero en llegar" en una regata de varias clases)
        fleet = max(len(group), (category.fleet_size or 0) if category else 0)
        if fleet < config.min_fleet:
            continue
        coefficient = config.coefficient(event.ranking_level)
        division = category.division if category else Division.OPEN
        for result in group:
            finished = result.status == ResultStatus.FINISHED and result.position
            base = 100 * (fleet - result.position + 1) / fleet if finished and result.position <= fleet else 0
            profile = getattr(getattr(result.boat, "owner", None), "sailor_profile", None) if result.boat_id else None
            rows.append(
                {
                    "key": competitor_key(boat_class.slug, result),
                    "class": boat_class.slug,
                    "class_name": boat_class.name,
                    "class_category": boat_class.category,
                    "division": division,
                    "name": result.skipper or result.boat_name,
                    "boat_name": result.boat_name,
                    "sail_number": result.sail_number,
                    "country": result.country.iso_code if result.country else None,
                    "country_name": result.country.name if result.country else None,
                    "sailor": (
                        {"user_id": profile.user_id, "avatar": profile.avatar.url if profile.avatar else None}
                        if profile and profile.is_public
                        else None
                    ),
                    "event": {"slug": event.slug, "name": event.name, "date": (event.end_date or event.start_date).isoformat()},
                    "category": category.name if category else None,
                    "position": result.position if finished else None,
                    "status": result.status,
                    "fleet": fleet,
                    "level": event.ranking_level,
                    "coefficient": coefficient,
                    "points": round(base * coefficient, 1),
                }
            )
    cache.set(key, rows, CACHE_SECONDS)
    return rows


def leaderboard(season, boat_class, division=Division.OPEN, country=None, cutoff=None):
    """Tabla de una clase y división (y opcionalmente un país), ordenada por puntos."""
    config = RankingConfig.get()
    rows = [r for r in score_rows(season, cutoff) if r["class"] == boat_class and r["division"] == division]
    competitors = {}
    for row in rows:
        entry = competitors.setdefault(row["key"], {"key": row["key"], "results": []})
        entry["results"].append(row)
    table = []
    for entry in competitors.values():
        results = sorted(entry["results"], key=lambda r: (-r["points"], r["event"]["date"]))
        counted = results[: config.best_of]
        latest = max(results, key=lambda r: r["event"]["date"])
        if country and latest["country"] != country:
            continue
        table.append(
            {
                "key": entry["key"],
                "name": latest["name"],
                "boat_name": latest["boat_name"],
                "sail_number": latest["sail_number"],
                "country": latest["country"],
                "country_name": latest["country_name"],
                "sailor": next((r["sailor"] for r in results if r["sailor"]), None),
                "points": round(sum(r["points"] for r in counted), 1),
                "events": len(results),
                "results": [
                    {k: r[k] for k in ("event", "category", "position", "status", "fleet", "level", "coefficient", "points")}
                    | {"counted": r in counted}
                    for r in sorted(results, key=lambda r: r["event"]["date"], reverse=True)
                ],
            }
        )
    table.sort(key=lambda e: (-e["points"], -e["events"], e["name"]))
    rank = 0
    previous = None
    for index, entry in enumerate(table, start=1):
        if entry["points"] != previous:
            rank = index
            previous = entry["points"]
        entry["rank"] = rank  # empates: mismo puesto
    return table


def with_movement(season, boat_class, division, country=None):
    """La tabla de hoy con la diferencia de puestos contra hace 30 días (positivo = subió)."""
    today = date.today()
    table = leaderboard(season, boat_class, division, country)
    before = {e["key"]: e["rank"] for e in leaderboard(season, boat_class, division, country, cutoff=today - timedelta(days=MOVEMENT_DAYS))}
    for entry in table:
        old = before.get(entry["key"])
        entry["movement"] = None if old is None else old - entry["rank"]
        entry["is_new"] = old is None and bool(before)
    return table


def options(season):
    """Qué se puede elegir en la pantalla: temporadas, clases con resultados (y sus divisiones) y países."""
    rows = score_rows(season)
    classes = {}
    countries = {}
    for row in rows:
        info = classes.setdefault(row["class"], {"slug": row["class"], "name": row["class_name"], "category": row["class_category"], "divisions": set(), "competitors": set()})
        info["divisions"].add(row["division"])
        info["competitors"].add(row["key"])
        if row["country"]:
            countries[row["country"]] = row["country_name"]
    order = [d.value for d in Division]
    return {
        "classes": sorted(
            (
                {**{k: v for k, v in c.items() if k not in ("divisions", "competitors")}, "divisions": sorted(c["divisions"], key=order.index), "competitors": len(c["competitors"])}
                for c in classes.values()
            ),
            key=lambda c: (-c["competitors"], c["name"]),
        ),
        "countries": [{"iso": iso, "name": name} for iso, name in sorted(countries.items(), key=lambda x: x[1] or "")],
    }


def seasons():
    years = set()
    for event in Event.objects.filter(is_published=True, counts_for_ranking=True, results__isnull=False).distinct():
        years.add((event.end_date or event.start_date).year)
    return sorted(years, reverse=True)
