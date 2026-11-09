"""
Marinas reales para probar el directorio (datos de fuentes públicas, noviembre de 2026).

Uso: python manage.py seed_marinas   (después de seed_base)
Se puede correr varias veces; actualiza en lugar de duplicar.

- Las fuentes (sitios de las marinas y guías náuticas) no siempre coinciden: se cargó el valor oficial
  o el más conservador, y se dejó vacío lo que no estaba claro. Todas quedan como "sin confirmar"
  hasta que el equipo de MSAIL las valide con cada marina.
- Los servicios marcados son los que informan las fuentes; lo no marcado es "no informado".
- Las coordenadas son aproximadas. Sin fotos: se suben desde el panel.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.geo.models import Country, Region
from apps.marinas.models import SERVICE_KEYS, Marina

MARINAS = [
    {
        "name": "Puerto Portals",
        "country": "ES", "region": "balearic-islands-palma", "city": "Calvià (Mallorca)",
        "lat": 39.5306, "lng": 2.5672,
        "website": "https://www.puertoportals.com",
        "berths": 640, "max_length": 60,
        "services": ["water", "electricity", "showers", "fuel", "wifi", "laundry", "security", "boatyard"],
        "description": "Marina de lujo al suroeste de Palma, con amarres para esloras de hasta 60 m.",
    },
    {
        "name": "Marina Port Vell",
        "country": "ES", "region": "catalonia-barcelona", "city": "Barcelona",
        "lat": 41.3767, "lng": 2.1840,
        "website": "https://www.marinaportvellbarcelona.com",
        "max_length": 190, "max_draft": 12,
        "services": ["water", "electricity", "showers", "fuel", "wifi", "laundry", "security"],
        "description": "Marina para superyates en el centro de Barcelona, con repostaje directo en el amarre.",
    },
    {
        "name": "Cowes Yacht Haven",
        "country": "GB", "region": "isle-of-wight-cowes", "city": "Cowes",
        "lat": 50.7625, "lng": -1.2972,
        "phone": "+44 1983 299975", "vhf": "80",
        "max_length": 40, "max_draft": 3.5,
        "services": ["water", "electricity", "showers", "wifi", "laundry"],
        "description": "En el centro de Cowes, sede habitual de la Cowes Week y de la largada del Fastnet.",
    },
    {
        "name": "Safe Harbor Newport Shipyard",
        "country": "US", "region": "rhode-island-newport", "city": "Newport",
        "lat": 41.4926, "lng": -71.3203,
        "website": "https://shmarinas.com/safe-harbor-newport-shipyard",
        "phone": "+1 401 846 6002", "vhf": "9",
        "max_length": 111, "max_draft": 7.3,
        "services": ["water", "electricity", "showers", "fuel", "boatyard"],
        "description": "Astillero y marina en el puerto de Newport, con amarres de hasta 365 pies (111 m).",
    },
    {
        "name": "Miami Beach Marina",
        "country": "US", "region": "florida-miami", "city": "Miami Beach",
        "lat": 25.7725, "lng": -80.1378,
        "berths": 385, "max_length": 76, "max_draft": 3.6,
        "services": ["water", "electricity", "fuel", "wifi", "security"],
        "description": "En South Beach, a la entrada de Government Cut, con amarres de hasta 250 pies (76 m).",
    },
    {
        "name": "Marina da Glória",
        "country": "BR", "region": "rio-de-janeiro", "city": "Río de Janeiro",
        "lat": -22.9200, "lng": -43.1700,
        "berths": 415,
        "services": [],
        "description": "En la bahía de Guanabara, frente al Pan de Azúcar. Fue sede de vela de los Juegos Olímpicos de 2016.",
    },
]


class Command(BaseCommand):
    help = "Carga marinas reales para el directorio (requiere seed_base)."

    @transaction.atomic
    def handle(self, *args, **options):
        countries = {c.iso_code: c for c in Country.objects.all()}
        missing = sorted({m["country"] for m in MARINAS} - countries.keys())
        if missing:
            self.stderr.write(self.style.ERROR(f"Faltan países {missing}: corré primero `manage.py seed_base`."))
            return
        created = 0
        for data in MARINAS:
            country = countries[data["country"]]
            fields = {
                "name": data["name"],
                "country": country,
                "region": Region.objects.filter(country=country, slug=data["region"]).first(),
                "city": data["city"],
                "latitude": data["lat"],
                "longitude": data["lng"],
                "website": data.get("website", ""),
                "phone": data.get("phone", ""),
                "vhf_channel": data.get("vhf", ""),
                "berths": data.get("berths"),
                "max_length_m": data.get("max_length"),
                "max_draft_m": data.get("max_draft"),
                "description": data["description"],
                "verified": False,
                **{service: service in data["services"] for service in SERVICE_KEYS},
            }
            _marina, was_created = Marina.objects.update_or_create(slug=slugify(data["name"]), defaults=fields)
            created += was_created
        self.stdout.write(self.style.SUCCESS(f"{len(MARINAS)} marinas cargadas ({created} nuevas)."))
