"""
Regatas de EJEMPLO con clasificaciones completas, para ver el ranking funcionando antes de tener resultados reales.
Se crean para la temporada actual y la anterior (para ver el selector de temporadas y la historia de cada navegante).

Uso:
  python manage.py seed_demo_ranking            crea (o vuelve a crear) las regatas de ejemplo
  python manage.py seed_demo_ranking --remove   borra todas las regatas de ejemplo y sus resultados

Las regatas y los navegantes son inventados. Quedan marcadas como «datos de ejemplo» (Event.is_demo): no aparecen
en el calendario, el mapa ni el clima, y la pantalla de Ranking avisa que hay datos de ejemplo.
"""

import random
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.events.models import Event, EventCategory, EventResult
from apps.geo.models import Country
from apps.sailing.models import BoatClass

FIRST = [
    "Martín", "Sofía", "Mateo", "Lucía", "Tomás", "Valentina", "Benjamín", "Camila", "Joaquín", "Martina", "Felipe",
    "Julieta", "Lucas", "Agustina", "Santiago", "Catalina", "Bruno", "Emilia", "Facundo", "Renata", "Thiago", "Isabella",
    "Ignacio", "Olivia", "Gonzalo", "Paula", "Diego", "Clara", "Nicolás", "Victoria",
]
LAST = [
    "Ferraro", "Quiroga", "Bianchi", "Santos", "Olmedo", "Rivas", "Cardozo", "Medina", "Vidal", "Acosta", "Moreira",
    "Paz", "Ibarra", "Luna", "Correa", "Sosa", "Molina", "Rey", "Benítez", "Ortiz", "Navarro", "Duarte",
]
COUNTRIES = ["AR", "AR", "AR", "BR", "BR", "UY", "CL", "ES", "US", "PE"]

# (clase, cantidad de navegantes del pool, regatas: (nombre, días atrás, nivel, flota, divisiones))
PLAN = [
    ("ilca-7", 32, [
        ("Copa de Verano ILCA (ejemplo)", 280, "club", 18, ["open"]),
        ("Campeonato Nacional ILCA 7 (ejemplo)", 200, "national", 28, ["open"]),
        ("Sudamericano ILCA 7 (ejemplo)", 120, "continental", 24, ["open"]),
        ("Semana Internacional de Otoño (ejemplo)", 60, "regional", 20, ["open"]),
        ("Mundial ILCA 7 (ejemplo)", 15, "world", 30, ["open"]),
    ]),
    ("ilca-6", 26, [
        ("Nacional ILCA 6 (ejemplo)", 190, "national", 22, ["open", "women"]),
        ("Sudamericano ILCA 6 (ejemplo)", 110, "continental", 20, ["open", "women", "u21"]),
        ("Copa del Plata ILCA 6 (ejemplo)", 25, "regional", 18, ["open", "women"]),
    ]),
    ("optimist", 40, [
        ("Selectivo Optimist (ejemplo)", 230, "national", 34, ["open", "u15"]),
        ("Sudamericano Optimist (ejemplo)", 140, "continental", 36, ["open", "u15"]),
        ("Copa Juvenil de Primavera (ejemplo)", 40, "regional", 28, ["open", "u15"]),
        ("Regata del Club (ejemplo)", 10, "club", 16, ["open"]),
    ]),
    ("j70", 18, [
        ("Circuito J/70 · Fecha 1 (ejemplo)", 210, "regional", 12, ["open"]),
        ("Nacional J/70 (ejemplo)", 100, "national", 15, ["open"]),
        ("Circuito J/70 · Final (ejemplo)", 20, "regional", 14, ["open"]),
    ]),
]


class Command(BaseCommand):
    help = "Crea (o con --remove borra) regatas de ejemplo con resultados completos para ver el ranking."

    def add_arguments(self, parser):
        parser.add_argument("--remove", action="store_true", help="Borra todas las regatas de ejemplo.")
        parser.add_argument("--seed", type=int, default=11)
        parser.add_argument("--seasons", type=int, default=2, help="Cuántas temporadas (la actual y las anteriores).")

    @transaction.atomic
    def handle(self, *args, **options):
        removed = Event.objects.filter(is_demo=True).count()
        Event.objects.filter(is_demo=True).delete()  # también sus categorías y resultados
        if options["remove"]:
            self.stdout.write(self.style.SUCCESS(f"Regatas de ejemplo borradas: {removed}."))
            return

        countries = {c.iso_code: c for c in Country.objects.filter(iso_code__in=set(COUNTRIES))}
        missing = set(COUNTRIES) - set(countries)
        if missing:
            raise CommandError(f"Faltan países en la base: {', '.join(sorted(missing))} (corré seed_base).")
        host = countries["AR"]
        rng = random.Random(options["seed"])
        today = date.today()
        created = 0
        for slug, pool_size, regattas in PLAN:
            boat_class = BoatClass.objects.filter(slug=slug).first()
            if not boat_class:
                self.stdout.write(self.style.WARNING(f"No existe la clase {slug}: se saltea."))
                continue
            # Navegantes del pool: nombre, vela, país, nivel (para que los resultados tengan cierta lógica) y divisiones.
            pool = []
            for i in range(pool_size):
                iso = COUNTRIES[i % len(COUNTRIES)]
                woman = i % 3 == 1
                young = i % 4 == 0
                pool.append(
                    {
                        "name": f"{rng.choice(FIRST)} {rng.choice(LAST)}",
                        "sail": f"{iso} {rng.randint(100, 999)}",
                        "country": countries[iso],
                        "skill": rng.gauss(0, 1),
                        "women": woman,
                        "young": young,
                    }
                )
            plan = [
                (name, days_ago + 365 * years_back, level, fleet, divisions, years_back)
                for years_back in range(max(1, options["seasons"]))
                for name, days_ago, level, fleet, divisions in regattas
            ]
            for name, days_ago, level, fleet, divisions, years_back in plan:
                end = today - timedelta(days=days_ago)
                # Cada año los navegantes rinden un poco distinto (alguno mejora, otro empeora).
                if years_back:
                    for sailor in pool:
                        sailor.setdefault("past_skill", sailor["skill"] + rng.gauss(0, 0.7))
                event = Event.objects.create(
                    name=f"{name.replace(' (ejemplo)', '')} {end.year} (ejemplo)",
                    slug=f"ejemplo-{slug}-{end.isoformat()}",
                    event_type="youth" if slug == "optimist" else "one_design",
                    start_date=end - timedelta(days=3),
                    end_date=end,
                    country=host,
                    city="Buenos Aires",
                    organizer_name="MSAIL (datos de ejemplo)",
                    ranking_level=level,
                    is_demo=True,
                    is_published=True,
                )
                event.boat_classes.add(boat_class)
                entrants = rng.sample(pool, k=min(fleet, len(pool)))
                # El resultado depende del nivel de cada uno más un poco de azar.
                entrants.sort(key=lambda s: -((s.get("past_skill", s["skill"]) if years_back else s["skill"]) + rng.gauss(0, 0.8)))
                for order, division in enumerate(divisions):
                    label = {"open": "General", "women": "Femenina", "u15": "Sub-15", "u21": "Sub-21"}[division]
                    category = EventCategory.objects.create(event=event, name=label, boat_class=boat_class, division=division, order=order)
                    group = [s for s in entrants if division == "open" or (division == "women" and s["women"]) or (division in ("u15", "u21") and s["young"])]
                    rows = []
                    for position, sailor in enumerate(group, start=1):
                        # Algún que otro DNF, como en una regata de verdad.
                        dnf = division == "open" and rng.random() < 0.04
                        rows.append(
                            EventResult(
                                event=event,
                                category=category,
                                position=None if dnf else position,
                                status="dnf" if dnf else "finished",
                                boat_name=f"{boat_class.name} {sailor['sail']}",
                                sail_number=sailor["sail"],
                                skipper=sailor["name"],
                                country=sailor["country"],
                            )
                        )
                    # De una (sin avisos a seguidores: nadie sigue estas regatas) y mucho más rápido en Supabase.
                    EventResult.objects.bulk_create(rows)
                created += 1
        self.stdout.write(self.style.SUCCESS(f"Regatas de ejemplo: {created} creadas ({removed} anteriores borradas)."))
