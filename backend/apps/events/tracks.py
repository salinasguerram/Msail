"""
Tracks de las regatas: el recorrido GPS de cada barco, para ver la carrera repetida en la app (como Telltale o YB).

Cada barco se carga con un archivo GPX (el formato que exportan los trackers, relojes y apps de navegación).
Se guardan los puntos cada TRACK_STEP_SECONDS segundos, como [segundos UNIX, latitud, longitud].
"""

import math
import xml.etree.ElementTree as ET
from datetime import datetime

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

TRACK_STEP_SECONDS = 5  # un punto cada 5 s alcanza para que la repetición se vea fluida y pese poco
MAX_GPX_MB = 20
# Colores de los barcos (se asignan en orden; como los de las apps de tracking).
BOAT_COLORS = [
    "#22d3ee", "#facc15", "#f472b6", "#4ade80", "#fb923c", "#a78bfa", "#f87171", "#60a5fa",
    "#34d399", "#e879f9", "#fde047", "#2dd4bf", "#fca5a5", "#93c5fd", "#bef264", "#fdba74",
]


def _parse_time(text):
    text = (text or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def parse_gpx(file):
    """Puntos [t, lat, lng] de un GPX (track o ruta con hora), ordenados y cada TRACK_STEP_SECONDS segundos."""
    if file.size > MAX_GPX_MB * 1024 * 1024:
        raise ValidationError(_("El GPX supera los %(mb)s MB.") % {"mb": MAX_GPX_MB})
    try:
        root = ET.parse(file).getroot()
    except ET.ParseError as exc:
        raise ValidationError(_("No es un archivo GPX válido.")) from exc
    points = []
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag not in ("trkpt", "rtept"):
            continue
        try:
            lat, lng = float(element.get("lat")), float(element.get("lon"))
        except (TypeError, ValueError):
            continue
        when = None
        for child in element:
            if child.tag.rsplit("}", 1)[-1] == "time":
                when = _parse_time(child.text)
        if when is not None and -90 <= lat <= 90 and -180 <= lng <= 180:
            points.append((when, lat, lng))
    if len(points) < 2:
        raise ValidationError(_("El GPX no tiene puntos con hora: hace falta el recorrido con la hora de cada punto."))
    return thin(sorted(points))


def thin(points):
    """Deja un punto cada TRACK_STEP_SECONDS segundos (y siempre el último)."""
    result = []
    for t, lat, lng in points:
        if not result or t - result[-1][0] >= TRACK_STEP_SECONDS:
            result.append([round(t), round(lat, 6), round(lng, 6)])
    last = points[-1]
    if result[-1][0] != round(last[0]):
        result.append([round(last[0]), round(last[1], 6), round(last[2], 6)])
    return result


def distance_nm(lat1, lng1, lat2, lng2):
    r = math.pi / 180
    a = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lng2 - lng1) * r / 2) ** 2
    return 3440.065 * 2 * math.asin(math.sqrt(a))


def max_speed_kn(points):
    """Velocidad máxima (nudos), promediando de a 30 s para que un salto del GPS no la infle."""
    best = 0.0
    j = 0
    for i in range(1, len(points)):
        while points[i][0] - points[j][0] > 30 and j < i - 1:
            j += 1
        seconds = points[i][0] - points[j][0]
        if seconds >= 10:
            distance = sum(distance_nm(points[k][1], points[k][2], points[k + 1][1], points[k + 1][2]) for k in range(j, i))
            best = max(best, distance / (seconds / 3600))
    return round(best, 1)
