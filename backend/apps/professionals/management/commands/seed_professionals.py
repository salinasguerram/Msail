"""
Profesionales reales para probar el directorio (datos de fuentes públicas, noviembre de 2026).

Uso: python manage.py seed_professionals   (después de seed_base)
Se puede correr varias veces; actualiza en lugar de duplicar.

- Solo se cargaron datos confirmados en sus sitios o en guías náuticas (dirección, web, teléfono).
  Lo que no se pudo confirmar quedó vacío. Todos quedan como "sin confirmar" hasta que el equipo
  de MSAIL los valide con cada profesional.
- Coordenadas aproximadas. Sin fotos ni logos: se suben desde el panel.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.geo.models import Country, Region
from apps.professionals.models import Professional, Specialty

PROFESSIONALS = [
    {
        "name": "North Sails Palma",
        "specialties": ["sailmaking", "rigging"],
        "headline": "Velería y servicio de velas para veleros y superyates.",
        "country": "ES", "region": "balearic-islands-palma", "city": "Palma",
        "address": "Polígono Son Morro, Carrer Ca Na Melis 11, 07007 Palma",
        "service_area": "Mallorca y Baleares",
        "website": "https://northsails.com/pages/sailloft-palma-de-mallorca-spain",
        "lat": 39.5880, "lng": 2.6760,
        "description": "Taller de velas de North Sails en Palma, con oficina en el Muelle Viejo para recibir a los clientes.",
    },
    {
        "name": "Quantum Sails Annapolis",
        "specialties": ["sailmaking", "canvas"],
        "headline": "Velas nuevas, reparaciones, recortes y lonas.",
        "country": "US", "region": "maryland-annapolis", "city": "Annapolis",
        "address": "104 Severn Avenue, Annapolis, MD 21403",
        "service_area": "Annapolis y la bahía de Chesapeake",
        "phone": "+1 410 268 1161",
        "website": "https://www.quantumsails.com/en/lofts/quantum-annapolis",
        "lat": 38.9740, "lng": -76.4840,
        "description": "Velería en Eastport con servicio de reparación y retiro y entrega de velas en Annapolis y alrededores.",
    },
    {
        "name": "Spencer Rigging",
        "specialties": ["rigging"],
        "headline": "Rigging para veleros de regata, crucero y superyates.",
        "country": "GB", "region": "isle-of-wight-cowes", "city": "Cowes",
        "address": "Empire Buildings, St Mary's Road, Cowes",
        "service_area": "Isla de Wight y el Solent",
        "lat": 50.7600, "lng": -1.3010,
        "description": "Taller de rigging en Cowes. Hace inspecciones de jarcia fija y de labor, terminales y herrajes.",
    },
    {
        "name": "Richardsons Yacht Services",
        "specialties": ["boatyard", "composites", "mechanics"],
        "headline": "Astillero: construcción, reparaciones y refit.",
        "country": "GB", "region": "isle-of-wight-cowes", "city": "Newport (Isla de Wight)",
        "address": "Island Harbour Marina, río Medina",
        "service_area": "Isla de Wight",
        "website": "https://richardsonsyacht.co.uk",
        "lat": 50.7140, "lng": -1.2780,
        "description": "Astillero y servicios de reparación y refit sobre el río Medina, con náutica (chandlery).",
    },
    {
        "name": "Oscar Salas · North Sails",
        "specialties": ["sailmaking"],
        "headline": "Representante de North Sails. Reparación de velas.",
        "country": "AR", "region": None, "city": "Mar del Plata",
        "service_area": "Mar del Plata",
        "phone": "+54 223 451 1451",
        "lat": -38.0410, "lng": -57.5340,
        "description": "Representante de North Sails en Mar del Plata, dedicado a la reparación de velas.",
    },
]


class Command(BaseCommand):
    help = "Carga profesionales reales para el directorio (requiere seed_base)."

    @transaction.atomic
    def handle(self, *args, **options):
        countries = {c.iso_code: c for c in Country.objects.all()}
        missing = sorted({p["country"] for p in PROFESSIONALS} - countries.keys())
        if missing:
            self.stderr.write(self.style.ERROR(f"Faltan países {missing}: corré primero `manage.py seed_base`."))
            return
        specialties = {s.slug: s for s in Specialty.objects.all()}
        created = 0
        for data in PROFESSIONALS:
            country = countries[data["country"]]
            professional, was_created = Professional.objects.update_or_create(
                slug=slugify(data["name"]),
                defaults={
                    "name": data["name"],
                    "headline": data["headline"],
                    "description": data["description"],
                    "country": country,
                    "region": Region.objects.filter(country=country, slug=data["region"]).first() if data["region"] else None,
                    "city": data["city"],
                    "address": data.get("address", ""),
                    "service_area": data.get("service_area", ""),
                    "phone": data.get("phone", ""),
                    "website": data.get("website", ""),
                    "latitude": data["lat"],
                    "longitude": data["lng"],
                    "verified": False,
                },
            )
            professional.specialties.set([specialties[s] for s in data["specialties"] if s in specialties])
            created += was_created
        self.stdout.write(self.style.SUCCESS(f"{len(PROFESSIONALS)} profesionales cargados ({created} nuevos)."))
