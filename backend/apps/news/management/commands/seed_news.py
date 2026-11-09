"""
Noticias de ejemplo, escritas por MSAIL a partir de información publicada (cada una cita su fuente).

Uso: python manage.py seed_news   (después de seed_base y seed_events)
Se puede correr varias veces: actualiza los textos sin cambiar la fecha de publicación ni las lecturas.
No incluyen fotos: las de prensa tienen derechos de autor. Se agregan desde el panel.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.events.models import Event
from apps.geo.models import Country
from apps.news.models import Article, Highlight
from apps.sailing.models import BoatClass

ARTICLES = [
    {
        "title": "Django 7x gana la 47ª Rolex Middle Sea Race",
        "summary": "El equipo de Giovanni Lombardi Stronati se quedó con la clasificación general IRC de la vuelta a Sicilia. "
        "Black Jack 100 fue el primer monocasco en llegar a Malta.",
        "body": (
            "Django 7x ganó la clasificación general IRC de la 47ª Rolex Middle Sea Race, la regata de 606 millas que larga y llega "
            "en el Grand Harbour de La Valeta después de dar la vuelta a Sicilia.\n\n"
            "Black Jack 100, de Remon Vos y con Tristan Le Brun como skipper, fue el primer monocasco en cruzar la llegada. "
            "En la general IRC, el FP54 Daguet de Frederik Puzin terminó tercero.\n\n"
            "La regata la organizan el Royal Malta Yacht Club y el RORC. La clasificación ya está en la página de la regata en MSAIL."
        ),
        "hours_ago": 3,
        "highlight": Highlight.DAY,
        "country": "MT",
        "classes": ["irc"],
        "event": "rolex-middle-sea-race-2026",
        "source": ("Yacht.de", "https://www.yacht.de/en/regatta/races/rolex-middle-sea-race-django-7x-wins-the-race-round-sicily/"),
    },
    {
        "title": "Nola, campeón general ORC de la 44ª Copa del Rey MAPFRE",
        "summary": "El barco de Taavet Hinrikus fue el mejor de todas las clases ORC en tiempo corregido en la bahía de Palma.",
        "body": (
            "Nola, de Taavet Hinrikus, con Margus Uudam al timón y Hugo Rocha como táctico, ganó la clase ORC A y la combinada de "
            "todas las clases ORC de la 44ª Copa del Rey MAPFRE.\n\n"
            "Los otros campeones fueron Vudu en ABANCA ORC 0, Teatro del Soho San Miguel en Uber ORC B, Niramo en Azulmarino ORC C "
            "y Nadir en ClubSwan 42. Baleària Team RCNP se llevó la Baleària Women's Cup.\n\n"
            "El rey Felipe VI entregó los trofeos a los tres primeros de cada clase en el Palacio de La Almudaina."
        ),
        "hours_ago": 26,
        "highlight": Highlight.WEEK,
        "country": "ES",
        "classes": ["orc"],
        "event": "44a-copa-del-rey-mapfre",
        "source": ("ORC", "https://orc.org/sailors/news-archive/winning-crews-crowned-at-44-copa-del-rey-mapfre"),
    },
    {
        "title": "Tensacon gana IRC Regata en la 51ª Off Valparaíso",
        "summary": "51 barcos y unos 400 navegantes compitieron del 16 al 18 de octubre frente a Valparaíso y Viña del Mar.",
        "body": (
            "Tensacon, de Ricardo Ramírez, ganó la categoría IRC Regata de la 51ª Regata Off Valparaíso, que organiza la Escuela "
            "Naval Arturo Prat con base en el Yacht Club de Chile, en Recreo.\n\n"
            "En IRC Crucero 1 ganó Rigel, de Claudio Stuardo, y en IRC Crucero 2, Raiatea, de Antonio Manterola.\n\n"
            "La regata suma puntos para el Campeonato Nacional Oceánico 2026-2027."
        ),
        "hours_ago": 50,
        "highlight": Highlight.WEEK,
        "country": "CL",
        "classes": ["irc"],
        "event": "51a-regata-off-valparaiso",
        "source": ("G5 Noticias", "https://g5noticias.cl/?p=924491"),
    },
    {
        "title": "La Rolex Sydney Hobart larga el 26 de diciembre",
        "summary": "La 81ª edición sale de Sydney Harbour a las 13:00 rumbo a Hobart, en Tasmania: 628 millas por el mar de Tasmania.",
        "body": (
            "La Rolex Sydney Hobart Yacht Race vuelve a largar el 26 de diciembre a las 13:00 desde Sydney Harbour. "
            "Es la 81ª edición de una de las regatas oceánicas más exigentes del mundo.\n\n"
            "El recorrido es de 628 millas náuticas hasta Hobart, en Tasmania, y lo organiza el Cruising Yacht Club of Australia. "
            "Se premia al primero en llegar y al ganador IRC en tiempo corregido, que se lleva la Tattersall Cup.\n\n"
            "Seguí la regata en MSAIL para recibir el aviso de largada y los resultados."
        ),
        "hours_ago": 75,
        "country": "AU",
        "classes": ["irc"],
        "event": "rolex-sydney-hobart-yacht-race-2026",
        "source": ("Rolex Sydney Hobart", "https://rolexsydneyhobart.com"),
    },
    {
        "title": "La Bacardi Cup llega a su edición número 100",
        "summary": "La clásica regata de la clase Star se corre en Biscayne Bay, Miami, del 7 al 13 de marzo de 2027.",
        "body": (
            "La Bacardi Cup cumple 100 ediciones en 2027. La regata de la clase Star se corre del 7 al 13 de marzo en "
            "Biscayne Bay, frente a Coconut Grove, en Miami.\n\n"
            "Las sedes son el Coral Reef Yacht Club, el Biscayne Bay Yacht Club, Shake-A-Leg Miami y el US Sailing Center.\n\n"
            "A continuación se corre la Bacardi Invitational Regatta, del 1 al 3 de abril, con J/70, Snipe, Melges 24 y VX One."
        ),
        "hours_ago": 100,
        "country": "US",
        "classes": ["star"],
        "event": "bacardi-cup-2027-100a-edicion",
        "source": ("Bacardi Cup", "https://bacardicup.com"),
    },
    {
        "title": "Fastnet 2027: largada en Cowes el 24 de julio",
        "summary": "La regata del RORC será parte de la Admiral's Cup 2027 y vuelve a terminar en Cherbourg.",
        "body": (
            "La Rolex Fastnet Race 2027 larga el 24 de julio en Cowes, en la isla de Wight, y termina en Cherbourg-en-Cotentin, "
            "en Francia.\n\n"
            "La organiza el Royal Ocean Racing Club (RORC) y en 2027 forma parte de la Admiral's Cup."
        ),
        "hours_ago": 24 * 9,
        "country": "GB",
        "classes": ["irc"],
        "event": "rolex-fastnet-race-2027",
        "source": ("RORC", "https://www.rorc.org"),
    },
]


class Command(BaseCommand):
    help = "Carga noticias de ejemplo (requiere seed_base; seed_events para vincular las regatas)."

    @transaction.atomic
    def handle(self, *args, **options):
        now = timezone.now()
        countries = {c.iso_code: c for c in Country.objects.all()}
        classes = {c.slug: c for c in BoatClass.objects.all()}
        created = 0
        for data in ARTICLES:
            source_name, source_url = data["source"]
            fields = {
                "title": data["title"],
                "summary": data["summary"],
                "body": data["body"],
                "highlight": data.get("highlight", Highlight.NONE),
                "country": countries.get(data["country"]),
                "event": Event.objects.filter(slug=data["event"]).first(),
                "source_name": source_name,
                "source_url": source_url,
                "author": "Redacción MSAIL",
            }
            article, was_created = Article.objects.update_or_create(
                slug=slugify(data["title"]),
                defaults=fields,
                # La fecha se fija solo al crearla: volver a correr el comando no la mueve.
                create_defaults={**fields, "published_at": now - timedelta(hours=data["hours_ago"])},
            )
            article.boat_classes.set([classes[s] for s in data["classes"] if s in classes])
            created += was_created
        self.stdout.write(self.style.SUCCESS(f"{len(ARTICLES)} noticias cargadas ({created} nuevas)."))
