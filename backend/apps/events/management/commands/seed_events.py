"""
Carga regatas reales para probar el calendario (fechas verificadas en noviembre de 2026).

Uso: python manage.py seed_events   (después de seed_base y seed_clubs)
Se puede correr varias veces; actualiza en lugar de duplicar.

- Fechas de fuentes oficiales o de prensa especializada. Si solo se conoce la largada
  (regatas oceánicas), end_date queda vacío.
- Las coordenadas son aproximadas (zona de la sede).
"""

from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.events.models import DocumentKind, Event, EventCategory, EventDocument, EventType
from apps.geo.models import Country, Region
from apps.sailing.models import BoatClass, Club

OLYMPIC = ["ilca-7", "ilca-6", "470", "49er", "49erfx", "nacra-17", "iqfoil", "formula-kite"]

EVENTS = [
    # ---------- Próximas
    {
        "name": "Rolex Sydney Hobart Yacht Race 2026",
        "type": EventType.OFFSHORE, "start": date(2026, 12, 26), "end": None,
        "country": "AU", "region": "sydney", "city": "Sídney", "venue": "Sydney Harbour (largada en Nielsen Park)",
        "lat": -33.8510, "lng": 151.2680, "organizer": "Cruising Yacht Club of Australia",
        "classes": ["irc"], "website": "https://rolexsydneyhobart.com",
        "categories": [("Primero en llegar (line honours)", None), ("IRC General · Tattersall Cup", "irc")],
        "description": "81ª edición. 628 millas náuticas de Sídney a Hobart (Tasmania). Largada el 26 de diciembre a las 13:00.",
    },
    {
        "name": "Bacardi Cup 2027 (100ª edición)",
        "type": EventType.ONE_DESIGN, "start": date(2027, 3, 7), "end": date(2027, 3, 13),
        "country": "US", "region": "florida-miami", "city": "Miami", "venue": "Biscayne Bay, Coconut Grove",
        "lat": 25.7303, "lng": -80.2338, "club": "coral-reef-yacht-club",
        "classes": ["star"], "website": "https://bacardicup.com",
        "categories": [("Star", "star")],
        "description": "Edición número 100 de la regata, con sedes en Coral Reef Yacht Club, Biscayne Bay Yacht Club, "
                       "Shake-A-Leg Miami y el US Sailing Center.",
    },
    {
        "name": "Trofeo Princesa Sofía 2027",
        "type": EventType.OLYMPIC, "start": date(2027, 3, 26), "end": date(2027, 4, 3),
        "country": "ES", "region": "balearic-islands-palma", "city": "Palma", "venue": "Bahía de Palma",
        "lat": 39.5550, "lng": 2.6250, "organizer": "Fundación Bahía Activa",
        "classes": OLYMPIC,
        "categories": [(name, slug) for name, slug in [
            ("ILCA 7", "ilca-7"), ("ILCA 6", "ilca-6"), ("470", "470"), ("49er", "49er"), ("49erFX", "49erfx"),
            ("Nacra 17", "nacra-17"), ("iQFOiL", "iqfoil"), ("Formula Kite", "formula-kite"),
        ]],
        "description": "56ª edición, regata de clases olímpicas. Fechas provisorias: confirmar con la organización.",
    },
    {
        "name": "Bacardi Invitational Regatta 2027",
        "type": EventType.ONE_DESIGN, "start": date(2027, 4, 1), "end": date(2027, 4, 3),
        "country": "US", "region": "florida-miami", "city": "Miami", "venue": "Biscayne Bay, Coconut Grove",
        "lat": 25.7303, "lng": -80.2338, "club": "coral-reef-yacht-club",
        "classes": ["j70", "snipe"], "website": "https://bacardiinvitational.com",
        "categories": [("J/70 · Midwinter Championship", "j70"), ("Snipe", "snipe"), ("Melges 24", None), ("VX One", None)],
        "description": "Para la clase J/70 también es el Midwinter Championship. Compiten además Melges 24 y VX One.",
    },
    {
        "name": "Rolex Fastnet Race 2027",
        "type": EventType.OFFSHORE, "start": date(2027, 7, 24), "end": None,
        "country": "GB", "region": "isle-of-wight-cowes", "city": "Cowes", "venue": "Largada en Cowes, llegada en Cherbourg",
        "lat": 50.7666, "lng": -1.3012, "organizer": "Royal Ocean Racing Club (RORC)",
        "classes": ["irc"],
        "description": "Parte del Admiral's Cup 2027. Llegada en Cherbourg-en-Cotentin (Francia).",
    },
    # ---------- Ya disputadas (2026)
    {
        "name": "Regata Buenos Aires – Río de Janeiro 2026",
        "type": EventType.OFFSHORE, "start": date(2026, 2, 14), "end": None,
        "country": "AR", "region": "buenos-aires", "city": "Buenos Aires", "venue": "Largada en Buenos Aires, llegada en Río de Janeiro",
        "lat": -34.5933, "lng": -58.3698, "club": "yacht-club-argentino",
        "classes": ["orc"],
        "description": "XXVIII edición, organizada por el Yacht Club Argentino y el Iate Clube do Rio de Janeiro.",
        "documents": [
            ("Aviso de regata", DocumentKind.NOTICE_OF_RACE,
             "https://www.icrj.com.br/velaicrj/images/aviso_regata/2026/02_fev/BA-Rio-2026_AR_red.pdf"),
        ],
    },
    {
        "name": "Semana Internacional de Vela de Ilhabela 2026",
        "type": EventType.INSHORE, "start": date(2026, 7, 24), "end": date(2026, 8, 1),
        "country": "BR", "region": None, "city": "Ilhabela", "venue": "Canal de São Sebastião",
        "lat": -23.7780, "lng": -45.3580, "organizer": "Yacht Club de Ilhabela",
        "classes": ["orc"],
        "description": "53ª edición, la regata de cruceros más grande de Sudamérica.",
    },
    {
        "name": "44ª Copa del Rey MAPFRE",
        "type": EventType.INSHORE, "start": date(2026, 8, 1), "end": date(2026, 8, 8),
        "country": "ES", "region": "balearic-islands-palma", "city": "Palma", "venue": "Bahía de Palma",
        "lat": 39.5550, "lng": 2.6250, "club": "real-club-nautico-de-palma",
        "classes": ["orc"],
        "description": "Más de 100 barcos inscriptos.",
    },
    {
        "name": "51ª Regata Off Valparaíso",
        "type": EventType.OFFSHORE, "start": date(2026, 10, 16), "end": date(2026, 10, 18),
        "country": "CL", "region": "valparaiso-papudo", "city": "Valparaíso y Viña del Mar", "venue": "Yacht Club de Chile, Recreo",
        "lat": -33.0280, "lng": -71.5770, "organizer": "Escuela Naval Arturo Prat",
        "classes": [],
        "description": "Parte del Campeonato Nacional Oceánico 2026-2027. Compitieron 51 embarcaciones.",
    },
    {
        "name": "Rolex Middle Sea Race 2026",
        "type": EventType.OFFSHORE, "start": date(2026, 10, 17), "end": date(2026, 10, 24),
        "country": "MT", "region": "valletta", "city": "La Valeta", "venue": "Grand Harbour",
        "lat": 35.8930, "lng": 14.5180, "organizer": "Royal Malta Yacht Club y RORC",
        "classes": ["irc", "orc", "class40"], "website": "https://www.rolexmiddlesearace.com",
        "categories": [("IRC", "irc"), ("ORC", "orc"), ("Class40", "class40"), ("Doble mano", None)],
        "documents": [
            ("Notice of Race (Class40)", DocumentKind.NOTICE_OF_RACE,
             "https://www.class40.com/media/pages/courses/saison-2026/middle-sea-race-2026/b7430c81d8-1782980888/notice-of-race.pdf"),
        ],
        "description": "47ª edición. 606 millas náuticas alrededor de Sicilia. El plazo para terminar vence el 24 de octubre.",
    },
]


class Command(BaseCommand):
    help = "Carga regatas reales para el calendario (requiere seed_base; seed_clubs para vincular clubes)."

    @transaction.atomic
    def handle(self, *args, **options):
        countries = {c.iso_code: c for c in Country.objects.all()}
        missing = sorted({e["country"] for e in EVENTS} - countries.keys())
        if missing:
            self.stderr.write(self.style.ERROR(f"Faltan países {missing}: corré primero `manage.py seed_base`."))
            return
        classes = {c.slug: c for c in BoatClass.objects.all()}

        created = 0
        for data in EVENTS:
            country = countries[data["country"]]
            club = Club.objects.filter(slug=data.get("club")).first() if data.get("club") else None
            region = Region.objects.filter(country=country, slug=data["region"]).first() if data["region"] else None
            event, was_created = Event.objects.update_or_create(
                slug=slugify(data["name"]),
                defaults={
                    "name": data["name"],
                    "event_type": data["type"],
                    "start_date": data["start"],
                    "end_date": data["end"],
                    "country": country,
                    "region": region,
                    "city": data["city"],
                    "venue": data["venue"],
                    "latitude": data["lat"],
                    "longitude": data["lng"],
                    "organizer_club": club,
                    # Si el club todavía no está cargado, queda su nombre como organizador.
                    "organizer_name": "" if club else data.get("organizer", data.get("club", "").replace("-", " ").title()),
                    "description": data["description"],
                    "website": data.get("website", ""),
                },
            )
            event.boat_classes.set([classes[s] for s in data["classes"] if s in classes])
            # Documentos de ejemplo: solo links a PDFs publicados por los organizadores (no se borran los subidos al panel).
            for i, (title, kind, url) in enumerate(data.get("documents", [])):
                EventDocument.objects.update_or_create(event=event, url=url, defaults={"title": title, "kind": kind, "order": i})
            event.categories.all().delete()
            EventCategory.objects.bulk_create(
                EventCategory(event=event, name=name, boat_class=classes.get(slug) if slug else None, order=i)
                for i, (name, slug) in enumerate(data.get("categories", []))
            )
            created += was_created

        self.stdout.write(self.style.SUCCESS(f"{len(EVENTS)} regatas cargadas ({created} nuevas)."))
