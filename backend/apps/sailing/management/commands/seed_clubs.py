"""
Carga clubes de vela reales para probar la app (selector de club, mapa y planeta).

Uso: python manage.py seed_clubs   (después de seed_base)
Se puede correr varias veces; actualiza en lugar de duplicar.

- Sitio web y año de fundación se cargan solo cuando una fuente los confirmó; si no, quedan vacíos.
- Las coordenadas son aproximadas (nivel puerto/barrio), suficientes para ubicarlos en el mapa.
- Ninguno queda "verificado": eso lo marca el equipo de MSAIL al confirmar los datos con cada club.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.geo.models import Country, Region
from apps.sailing.models import Club

# nombre, país, slug de región (o None), ciudad, dirección, web, año, lat, lng
CLUBS = [
    # Sudamérica
    ("Cofradía Náutica del Pacífico Austral", "CL", "valparaiso-papudo", "Algarrobo",
     "Almirante José Toribio Merino 3877", "https://www.cofradianautica.cl", None, -33.3627, -71.6718),
    ("Yacht Club Argentino", "AR", "buenos-aires", "Buenos Aires",
     "Dársena Norte, Espigón Sudeste", "http://www.yca.org.ar", 1883, -34.5933, -58.3698),
    ("Iate Clube do Rio de Janeiro", "BR", "rio-de-janeiro", "Río de Janeiro",
     "Av. Pasteur 333, Urca", "https://www.icrj.com.br", 1920, -22.9481, -43.1689),
    # Estados Unidos: dos en Rhode Island y dos en Florida para ver clubes cercanos en el mapa
    ("Ida Lewis Yacht Club", "US", "rhode-island-newport", "Newport",
     "Lime Rock, Wellington Avenue", "https://www.ilyc.org", 1928, 41.4826, -71.3299),
    ("New York Yacht Club · Harbour Court", "US", "rhode-island-newport", "Newport",
     "5 Halidon Avenue", "https://nyyc.org", 1844, 41.4757, -71.3286),
    ("Coral Reef Yacht Club", "US", "florida-miami", "Miami",
     "2484 South Bayshore Drive, Coconut Grove", "https://www.coralreefyachtclub.org", None, 25.7303, -80.2338),
    ("Biscayne Bay Yacht Club", "US", "florida-miami", "Miami",
     "Coconut Grove", "", 1887, 25.7270, -80.2385),
    ("San Diego Yacht Club", "US", "california-san-diego", "San Diego",
     "1011 Anchorage Lane", "https://www.sdyc.org", 1886, 32.7186, -117.2330),
    ("St. Francis Yacht Club", "US", None, "San Francisco",
     "Marina Boulevard", "https://www.stfyc.com", 1927, 37.8071, -122.4466),
    # Europa
    ("Royal Yacht Squadron", "GB", "isle-of-wight-cowes", "Cowes",
     "The Castle, Cowes", "https://www.rys.org.uk", 1815, 50.7666, -1.3012),
    ("Real Club Náutico de Palma", "ES", "balearic-islands-palma", "Palma",
     "Muelle de San Pedro 1", "", 1948, 39.5667, 2.6366),
    ("Yacht Club Costa Smeralda", "IT", "sardinia-porto-cervo", "Porto Cervo",
     "Via della Marina", "https://www.yccs.it", 1967, 41.1372, 9.5366),
    ("Yacht Club de Monaco", "MC", None, "Mónaco",
     "Quai Louis II", "https://www.yacht-club-monaco.mc", 1953, 43.7378, 7.4284),
]


class Command(BaseCommand):
    help = "Carga clubes de vela reales de distintos países (requiere seed_base)."

    @transaction.atomic
    def handle(self, *args, **options):
        countries = {c.iso_code: c for c in Country.objects.all()}
        missing = sorted({c[1] for c in CLUBS} - countries.keys())
        if missing:
            self.stderr.write(self.style.ERROR(f"Faltan países {missing}: corré primero `manage.py seed_base`."))
            return

        created = 0
        for name, iso, region_slug, city, address, website, founded, lat, lng in CLUBS:
            country = countries[iso]
            region = Region.objects.filter(country=country, slug=region_slug).first() if region_slug else None
            _, was_created = Club.objects.update_or_create(
                slug=slugify(name),
                defaults={
                    "name": name,
                    "country": country,
                    "region": region,
                    "city": city,
                    "address": address,
                    "website": website,
                    "founded_year": founded,
                    "latitude": lat,
                    "longitude": lng,
                },
            )
            created += was_created

        self.stdout.write(self.style.SUCCESS(f"{len(CLUBS)} clubes cargados ({created} nuevos)."))
