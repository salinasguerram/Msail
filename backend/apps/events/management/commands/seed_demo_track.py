"""
Carrera de EJEMPLO con recorridos GPS simulados, para ver cómo se ve "Track de la carrera" antes de tener GPX reales.

Uso: python manage.py seed_demo_track <slug-de-la-regata> [--boats 8]
Crea una barlovento-sotavento de dos vueltas frente a la sede, marcada como "datos de ejemplo" (la app lo avisa).
Se borra desde el panel (Tracks de carreras) cuando haya recorridos reales.
"""

import math
import random
from datetime import datetime, timedelta, timezone

from django.core.management.base import BaseCommand, CommandError

from apps.events.models import BoatTrack, Event, RaceTrack
from apps.events.tracks import TRACK_STEP_SECONDS

BOATS = ["Brisa", "Norte", "Alisio", "Pampero", "Levante", "Mistral", "Siroco", "Tramontana", "Zonda", "Garbí"]


def destination(lat, lng, bearing, nm):
    """Punto a `nm` millas náuticas de (lat, lng) con ese rumbo (aproximación plana: alcanza para 1-2 millas)."""
    r = math.pi / 180
    return lat + nm * math.cos(bearing * r) / 60, lng + nm * math.sin(bearing * r) / (60 * math.cos(lat * r))


def bearing_to(lat1, lng1, lat2, lng2):
    r = math.pi / 180
    dx = (lng2 - lng1) * math.cos(lat1 * r)
    dy = lat2 - lat1
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360


def distance(lat1, lng1, lat2, lng2):
    r = math.pi / 180
    return math.hypot((lat2 - lat1) * 60, (lng2 - lng1) * 60 * math.cos(lat1 * r))


def angle_diff(a, b):
    return (a - b + 540) % 360 - 180


def sail(rng, start, marks, wind_from, skill):
    """Simula un barco: ceñida en bordes (±45° del viento) y popa con trasluchadas, hasta pasar por todas las marcas."""
    lat, lng = start
    t = 0
    points = [(t, lat, lng)]
    for mark, upwind in marks:
        tack = rng.choice([-1, 1])
        next_turn = rng.randint(90, 240)
        for _ in range(20000):
            if distance(lat, lng, *mark) < 0.03:
                break
            to_mark = bearing_to(lat, lng, *mark)
            if upwind:
                heading = (wind_from + 45 * tack) % 360
                # Vira al llegar a la layline o cada tanto (con algo de azar, como en una regata de verdad).
                if abs(angle_diff(to_mark, wind_from)) >= 44 and angle_diff(to_mark, wind_from) * tack < 0 or t >= next_turn:
                    tack = -tack
                    next_turn = t + rng.randint(90, 240)
                    t += 10  # se pierde un poco en la virada
                speed = rng.uniform(5.4, 6.3) * skill
            else:
                heading = (to_mark + 18 * tack) % 360
                if t >= next_turn:
                    tack = -tack
                    next_turn = t + rng.randint(120, 260)
                speed = rng.uniform(7.0, 8.4) * skill
            lat, lng = destination(lat, lng, heading, speed * TRACK_STEP_SECONDS / 3600)
            t += TRACK_STEP_SECONDS
            points.append((t, lat, lng))
    return points


class Command(BaseCommand):
    help = "Crea una carrera de ejemplo con recorridos simulados en una regata (marcada como datos de ejemplo)."

    def add_arguments(self, parser):
        parser.add_argument("event", help="Slug de la regata.")
        parser.add_argument("--boats", type=int, default=8)
        parser.add_argument("--seed", type=int, default=7)

    def handle(self, *args, **options):
        event = Event.objects.filter(slug=options["event"]).first()
        if not event or event.latitude is None:
            raise CommandError("No existe esa regata o no tiene ubicación.")
        rng = random.Random(options["seed"])
        lat0, lng0 = float(event.latitude), float(event.longitude)
        wind_from = rng.choice([200, 220, 240, 270])
        windward = destination(lat0, lng0, wind_from, 1.0)
        leeward = destination(lat0, lng0, (wind_from + 180) % 360, 0.1)
        marks = [(windward, True), (leeward, False), (windward, True), ((lat0, lng0), False)]
        start_at = datetime.now(timezone.utc).replace(hour=13, minute=0, second=0, microsecond=0) - timedelta(days=1)

        race, _created = RaceTrack.objects.update_or_create(
            event=event, name="Simulación de ejemplo", defaults={"is_demo": True, "is_published": True, "order": 99}
        )
        race.boats.all().delete()
        count = max(2, min(options["boats"], len(BOATS)))
        for i in range(count):
            # Largada repartida sobre la línea, perpendicular al viento.
            start = destination(lat0, lng0, (wind_from + 90) % 360, (i - count / 2) * 0.02)
            points = sail(rng, start, marks, wind_from, skill=rng.uniform(0.93, 1.05))
            base = start_at.timestamp()
            BoatTrack.objects.create(
                race=race,
                boat_name=BOATS[i],
                sail_number=f"ESP-{100 + i * 7}",
                points=[[round(base + t), round(lat, 6), round(lng, 6)] for t, lat, lng in points],
            )
        self.stdout.write(self.style.SUCCESS(f"Carrera de ejemplo en {event.name}: {count} barcos (viento de {wind_from}°)."))
