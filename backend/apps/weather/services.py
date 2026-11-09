"""
Pronóstico semanal con Open-Meteo (gratis, sin clave; datos bajo licencia CC BY 4.0: hay que citar la fuente).

- Tiempo: viento y rachas en nudos, dirección, lluvia, temperatura y estado del cielo (código WMO).
- Mar: altura, dirección y período de las olas (en zonas sin mar vienen vacías).
Cada lugar se guarda en caché una hora para no consultar de más.
"""

import logging
from datetime import timedelta

import requests
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
DAYS = 7
CACHE_SECONDS = 60 * 60
TIMEOUT = 10
SOURCE = {"name": "Open-Meteo", "url": "https://open-meteo.com", "license": "CC BY 4.0"}

WEATHER_FIELDS = {
    "weather_code": "weather_code",
    "temperature_2m_max": "temp_max",
    "temperature_2m_min": "temp_min",
    "precipitation_sum": "rain_mm",
    "precipitation_probability_max": "rain_probability",
    "wind_speed_10m_max": "wind_kn",
    "wind_gusts_10m_max": "gusts_kn",
    "wind_direction_10m_dominant": "wind_direction",
}
MARINE_FIELDS = {
    "wave_height_max": "wave_m",
    "wave_direction_dominant": "wave_direction",
    "wave_period_max": "wave_period_s",
}


class ForecastUnavailable(Exception):
    """Open-Meteo no respondió o devolvió algo inesperado."""


def _get(url, params):
    response = requests.get(url, params=params, timeout=TIMEOUT)
    response.raise_for_status()
    return response.json()


def _columns(data, fields):
    daily = data.get("daily") or {}
    return {target: daily.get(source) or [] for source, target in fields.items()}, daily.get("time") or []


def get_forecast(latitude, longitude):
    """Siete días de pronóstico para esas coordenadas. Lanza ForecastUnavailable si el servicio falla."""
    lat, lng = round(float(latitude), 3), round(float(longitude), 3)
    key = f"forecast:{lat}:{lng}"
    cached = cache.get(key)
    if cached:
        return cached

    base = {"latitude": lat, "longitude": lng, "timezone": "auto", "forecast_days": DAYS}
    try:
        weather = _get(FORECAST_URL, {**base, "wind_speed_unit": "kn", "daily": ",".join(WEATHER_FIELDS)})
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Open-Meteo (tiempo) falló para %s,%s: %s", lat, lng, exc)
        raise ForecastUnavailable from exc
    try:
        marine = _get(MARINE_URL, {**base, "daily": ",".join(MARINE_FIELDS)})
    except (requests.RequestException, ValueError) as exc:
        # Sin datos del mar el pronóstico sigue sirviendo: las olas quedan vacías.
        logger.info("Open-Meteo (mar) falló para %s,%s: %s", lat, lng, exc)
        marine = {}

    weather_cols, dates = _columns(weather, WEATHER_FIELDS)
    if not dates:
        raise ForecastUnavailable
    marine_cols, marine_dates = _columns(marine, MARINE_FIELDS)
    marine_by_date = {date: i for i, date in enumerate(marine_dates)}

    days = []
    for i, date in enumerate(dates):
        day = {"date": date}
        for field, values in weather_cols.items():
            day[field] = values[i] if i < len(values) else None
        j = marine_by_date.get(date)
        for field, values in marine_cols.items():
            day[field] = values[j] if j is not None and j < len(values) else None
        days.append(day)

    result = {
        "timezone": weather.get("timezone"),
        "days": days,
        "has_waves": any(day["wave_m"] is not None for day in days),
        "updated_at": timezone.now().isoformat(),
        "source": SOURCE,
    }
    cache.set(key, result, CACHE_SECONDS)
    return result


# ---------- Viento en todo el planeta

WIND_GRID_STEP = 15  # grados entre puntos de la grilla (240 puntos)
WIND_OFFSETS = (0, 12, 24, 48)  # horas desde ahora que se pueden elegir en el mapa


def wind_grid_coords():
    return [(lat, lng) for lat in range(-60, 76, WIND_GRID_STEP) for lng in range(-180, 180, WIND_GRID_STEP)]


def get_wind_grid():
    """
    Viento a 10 m (nudos y dirección de donde viene) en una grilla de todo el planeta, para ahora y +12/+24/+48 h.
    Un solo pedido a Open-Meteo con todas las coordenadas; se guarda una hora.
    """
    now = timezone.now().replace(minute=0, second=0, microsecond=0)
    key = f"wind-grid:{now:%Y%m%d%H}"
    cached = cache.get(key)
    if cached:
        return cached

    coords = wind_grid_coords()
    params = {
        "latitude": ",".join(str(lat) for lat, _ in coords),
        "longitude": ",".join(str(lng) for _, lng in coords),
        "hourly": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "kn",
        "timezone": "GMT",
        "forecast_days": 3,
    }
    try:
        response = requests.get(FORECAST_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Open-Meteo (grilla de viento) falló: %s", exc)
        raise ForecastUnavailable from exc
    if not isinstance(data, list) or len(data) != len(coords):
        raise ForecastUnavailable

    times = data[0]["hourly"]["time"]
    wanted = [(now + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00") for h in WIND_OFFSETS]
    indexes = [times.index(t) if t in times else None for t in wanted]

    points = []
    for (lat, lng), item in zip(coords, data):
        speeds = item["hourly"]["wind_speed_10m"]
        directions = item["hourly"]["wind_direction_10m"]
        points.append(
            {
                "lat": lat,
                "lng": lng,
                "speed": [speeds[i] if i is not None else None for i in indexes],
                "direction": [directions[i] if i is not None else None for i in indexes],
            }
        )
    result = {
        "times": [f"{t}Z" for t in wanted],
        "offsets": list(WIND_OFFSETS),
        "points": points,
        "source": SOURCE,
    }
    cache.set(key, result, CACHE_SECONDS)
    return result
