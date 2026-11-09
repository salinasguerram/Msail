"""
Importación de la clasificación de una regata desde un CSV (exportado de Excel, Sailwave, Manage2Sail...).

Columnas reconocidas (la primera fila son los títulos; el orden no importa, mayúsculas y tildes tampoco):
  puesto | barco | vela | timonel | club | pais | puntos | tiempo | estado | categoria | nota
También se aceptan los títulos en inglés: position/rank, boat/yacht, sail, skipper/helm, club, country/nat,
points/total/net, time/elapsed/corrected, status, category/class/division, notes.
Solo "barco" es obligatoria. Separador: coma o punto y coma (se detecta solo).
"""

import csv
import io
from decimal import Decimal, InvalidOperation

from django.db import transaction

from apps.core.text import normalize
from apps.geo.models import Country
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify_followers

from .models import EventCategory, EventResult, ResultStatus

HEADERS = {
    "position": ["puesto", "pos", "position", "rank", "place", "posicion", "lugar"],
    "boat_name": ["barco", "boat", "yacht", "embarcacion", "nombre", "name", "boat name", "yacht name"],
    "sail_number": ["vela", "sail", "sail number", "sailno", "sail no", "numero de vela", "n vela"],
    "skipper": ["timonel", "skipper", "helm", "armador", "owner", "helmsman", "patron"],
    "club": ["club"],
    "country": ["pais", "country", "nat", "nation", "nationality"],
    "points": ["puntos", "points", "pts", "total", "net", "nett", "neto"],
    "time": ["tiempo", "time", "elapsed", "corrected", "elapsed time", "corrected time", "tiempo corregido"],
    "status": ["estado", "status", "code"],
    "category": ["categoria", "category", "class", "clase", "division", "fleet", "flota"],
    "notes": ["nota", "notas", "notes", "comentario"],
}
COLUMN_BY_HEADER = {alias: field for field, aliases in HEADERS.items() for alias in aliases}
# Códigos de los reglamentos de regata → estados de MSAIL.
STATUS_CODES = {s.value: s.value for s in ResultStatus} | {
    "dnc": ResultStatus.DNS.value,
    "rtd": ResultStatus.RET.value,
    "dne": ResultStatus.DSQ.value,
    "bfd": ResultStatus.DSQ.value,
    "ufd": ResultStatus.OCS.value,
}
TEMPLATE = (
    "puesto;barco;vela;timonel;club;pais;puntos;tiempo;estado;categoria;nota\r\n"
    "1;Mi Barco;ARG 1234;Ana Pérez;Yacht Club Argentino;AR;3;;;IRC;\r\n"
    "2;Otro Barco;CHI 55;Juan Soto;;CL;7;;;IRC;\r\n"
    ";Tercer Barco;;;;;;;DNF;IRC;Rompió el mástil\r\n"
)
MAX_ROWS = 2000
TEXT_LIMITS = (("sail_number", 30), ("skipper", 160), ("club", 160), ("time", 40), ("notes", 200), ("category", 120))


class ResultsImportError(Exception):
    """Error que se le muestra a quien importa."""


def _decode(raw):
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ResultsImportError("No se pudo leer el archivo: guardalo como CSV UTF-8.")


def _header_key(title):
    return " ".join(normalize(title).replace(".", " ").replace("_", " ").split())


def parse_csv(raw):
    """Devuelve (filas, errores). Cada fila es un dict con los campos de EventResult (category como texto)."""
    text = _decode(raw)
    sample = text[:4096]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        header = next(reader)
    except StopIteration as exc:
        raise ResultsImportError("El archivo está vacío.") from exc
    columns = [COLUMN_BY_HEADER.get(_header_key(h)) for h in header]
    if "boat_name" not in columns:
        raise ResultsImportError('Falta la columna "barco" en la primera fila.')

    rows, errors = [], []
    for line, values in enumerate(reader, start=2):
        if not any(v.strip() for v in values):
            continue
        if len(rows) >= MAX_ROWS:
            raise ResultsImportError(f"El archivo tiene más de {MAX_ROWS} filas.")
        data = {field: value.strip() for field, value in zip(columns, values) if field}
        row = {"line": line, "boat_name": data.get("boat_name", "")[:120]}
        if not row["boat_name"]:
            errors.append(f"Fila {line}: falta el nombre del barco.")
            continue
        for field, size in TEXT_LIMITS:
            row[field] = data.get(field, "")[:size]
        row["country"] = data.get("country", "").upper()[:2]

        status = normalize(data.get("status", "")).strip()
        position = data.get("position", "").rstrip("º°.").strip()
        # Algunos sistemas ponen el código (DNF, DNS...) en la columna del puesto.
        if position and not position.isdigit() and normalize(position) in STATUS_CODES:
            status, position = normalize(position), ""
        if status and status not in STATUS_CODES:
            errors.append(f'Fila {line}: estado "{data.get("status")}" desconocido (usá DNF, DNS, RET, DSQ u OCS).')
            continue
        row["status"] = STATUS_CODES.get(status, ResultStatus.FINISHED.value)
        if position:
            if not position.isdigit() or not 0 < int(position) < 10000:
                errors.append(f'Fila {line}: el puesto "{position}" no es un número.')
                continue
            row["position"] = int(position)
        else:
            row["position"] = None
            if row["status"] == ResultStatus.FINISHED:
                errors.append(f"Fila {line}: falta el puesto de {row['boat_name']}.")
                continue

        points = data.get("points", "").replace(",", ".")
        try:
            row["points"] = Decimal(points).quantize(Decimal("0.1")) if points else None
        except InvalidOperation:
            errors.append(f'Fila {line}: los puntos "{data.get("points")}" no son un número.')
            continue
        if row["points"] is not None and abs(row["points"]) >= 1_000_000:
            errors.append(f"Fila {line}: los puntos son demasiado grandes.")
            continue
        rows.append(row)
    if not rows and not errors:
        raise ResultsImportError("El archivo no tiene filas con resultados.")
    return rows, errors


@transaction.atomic
def import_results(event, rows, default_category=None, replace=True):
    """
    Guarda las filas en la regata. Las categorías se buscan por nombre (sin importar tildes) y,
    si no existen, se crean. Con replace=True se borran antes los resultados de las categorías importadas.
    Devuelve (importados, nombres de categorías creadas).
    """
    categories = {normalize(c.name): c for c in event.categories.all()}
    countries = {c.iso_code: c for c in Country.objects.all()}
    created_categories = []
    next_order = max((c.order for c in categories.values()), default=-1) + 1

    def category_for(name):
        nonlocal next_order
        if not name:
            return default_category
        key = normalize(name)
        if key not in categories:
            categories[key] = EventCategory.objects.create(event=event, name=name, order=next_order)
            created_categories.append(name)
            next_order += 1
        return categories[key]

    results = [
        EventResult(
            event=event,
            category=category_for(row["category"]),
            position=row["position"],
            status=row["status"],
            boat_name=row["boat_name"],
            sail_number=row["sail_number"],
            skipper=row["skipper"],
            club=row["club"],
            country=countries.get(row["country"]),
            points=row["points"],
            time=row["time"],
            notes=row["notes"],
        )
        for row in rows
    ]
    if replace:
        touched = {r.category_id for r in results}
        event.results.filter(category_id__in=[c for c in touched if c]).delete()
        if None in touched:
            event.results.filter(category__isnull=True).delete()
    EventResult.objects.bulk_create(results)
    if results:
        notify_followers(event, NotificationKind.RESULTS, f"results:{event.pk}")
    return len(results), created_categories
