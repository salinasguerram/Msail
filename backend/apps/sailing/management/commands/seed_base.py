"""
Carga los datos base: países, regiones náuticas y clases de embarcación.

Uso: python manage.py seed_base
Se puede correr varias veces; actualiza en lugar de duplicar.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.geo.models import Continent, Country, Region
from apps.sailing.models import BoatCategory, BoatClass

# iso, nombre ES, nombre EN, continente, lat, lng
COUNTRIES = [
    ("US", "Estados Unidos", "United States", Continent.NORTH_AMERICA, 39.8, -98.6),
    ("CA", "Canadá", "Canada", Continent.NORTH_AMERICA, 56.1, -106.3),
    ("MX", "México", "Mexico", Continent.NORTH_AMERICA, 23.6, -102.6),
    ("BR", "Brasil", "Brazil", Continent.SOUTH_AMERICA, -14.2, -51.9),
    ("AR", "Argentina", "Argentina", Continent.SOUTH_AMERICA, -38.4, -63.6),
    ("CL", "Chile", "Chile", Continent.SOUTH_AMERICA, -35.7, -71.5),
    ("UY", "Uruguay", "Uruguay", Continent.SOUTH_AMERICA, -32.5, -55.8),
    ("PE", "Perú", "Peru", Continent.SOUTH_AMERICA, -9.2, -75.0),
    ("ES", "España", "Spain", Continent.EUROPE, 40.5, -3.7),
    ("GB", "Reino Unido", "United Kingdom", Continent.EUROPE, 55.4, -3.4),
    ("FR", "Francia", "France", Continent.EUROPE, 46.2, 2.2),
    ("IT", "Italia", "Italy", Continent.EUROPE, 41.9, 12.6),
    ("MT", "Malta", "Malta", Continent.EUROPE, 35.9, 14.4),
    ("MC", "Mónaco", "Monaco", Continent.EUROPE, 43.7, 7.4),
    ("PT", "Portugal", "Portugal", Continent.EUROPE, 39.4, -8.2),
    ("GR", "Grecia", "Greece", Continent.EUROPE, 39.1, 21.8),
    ("HR", "Croacia", "Croatia", Continent.EUROPE, 45.1, 15.2),
    ("NL", "Países Bajos", "Netherlands", Continent.EUROPE, 52.1, 5.3),
    ("DE", "Alemania", "Germany", Continent.EUROPE, 51.2, 10.5),
    ("DK", "Dinamarca", "Denmark", Continent.EUROPE, 56.3, 9.5),
    ("SE", "Suecia", "Sweden", Continent.EUROPE, 60.1, 18.6),
    ("AU", "Australia", "Australia", Continent.OCEANIA, -25.3, 133.8),
    ("NZ", "Nueva Zelanda", "New Zealand", Continent.OCEANIA, -40.9, 174.9),
    ("ZA", "Sudáfrica", "South Africa", Continent.AFRICA, -30.6, 22.9),
    ("AE", "Emiratos Árabes Unidos", "United Arab Emirates", Continent.ASIA, 23.4, 53.8),
    ("JP", "Japón", "Japan", Continent.ASIA, 36.2, 138.3),
]

# iso país, nombre ES, nombre EN, lat, lng
REGIONS = [
    ("US", "Rhode Island (Newport)", "Rhode Island (Newport)", 41.49, -71.31),
    ("US", "Florida (Miami)", "Florida (Miami)", 25.76, -80.19),
    ("US", "Maryland (Annapolis)", "Maryland (Annapolis)", 38.98, -76.49),
    ("US", "California (San Diego)", "California (San Diego)", 32.72, -117.16),
    ("ES", "Islas Baleares (Palma)", "Balearic Islands (Palma)", 39.57, 2.65),
    ("ES", "Cataluña (Barcelona)", "Catalonia (Barcelona)", 41.39, 2.17),
    ("GB", "Isla de Wight (Cowes)", "Isle of Wight (Cowes)", 50.76, -1.30),
    ("FR", "Costa Azul (Saint-Tropez)", "French Riviera (Saint-Tropez)", 43.27, 6.64),
    ("IT", "Cerdeña (Porto Cervo)", "Sardinia (Porto Cervo)", 41.13, 9.53),
    ("MT", "La Valeta", "Valletta", 35.90, 14.51),
    ("CL", "Valparaíso (Papudo)", "Valparaíso (Papudo)", -32.51, -71.45),
    ("BR", "Río de Janeiro", "Rio de Janeiro", -22.91, -43.17),
    ("AR", "Buenos Aires", "Buenos Aires", -34.60, -58.38),
    ("AU", "Sídney", "Sydney", -33.87, 151.21),
    ("AU", "Australia Meridional (Adelaida)", "South Australia (Adelaide)", -34.93, 138.60),
    ("NZ", "Auckland", "Auckland", -36.85, 174.76),
    ("ZA", "Ciudad del Cabo", "Cape Town", -33.92, 18.42),
]

# nombre, categoría, olímpica, tripulantes
BOAT_CLASSES = [
    ("Optimist", BoatCategory.DINGHY, False, 1),
    ("ILCA 7", BoatCategory.DINGHY, True, 1),
    ("ILCA 6", BoatCategory.DINGHY, True, 1),
    ("ILCA 4", BoatCategory.DINGHY, False, 1),
    ("420", BoatCategory.DINGHY, False, 2),
    ("470", BoatCategory.DINGHY, True, 2),
    ("29er", BoatCategory.DINGHY, False, 2),
    ("49er", BoatCategory.DINGHY, True, 2),
    ("49erFX", BoatCategory.DINGHY, True, 2),
    ("Finn", BoatCategory.DINGHY, False, 1),
    ("Snipe", BoatCategory.DINGHY, False, 2),
    ("Star", BoatCategory.KEELBOAT, False, 2),
    ("J/70", BoatCategory.KEELBOAT, False, 4),
    ("J/24", BoatCategory.KEELBOAT, False, 5),
    ("Etchells", BoatCategory.KEELBOAT, False, 3),
    ("Dragon", BoatCategory.KEELBOAT, False, 3),
    ("TP52", BoatCategory.KEELBOAT, False, None),
    ("Nacra 17", BoatCategory.MULTIHULL, True, 2),
    ("Hobie 16", BoatCategory.MULTIHULL, False, 2),
    ("ORC", BoatCategory.OFFSHORE, False, None),
    ("IRC", BoatCategory.OFFSHORE, False, None),
    ("IMOCA 60", BoatCategory.OFFSHORE, False, None),
    ("Class40", BoatCategory.OFFSHORE, False, 2),
    ("AC75", BoatCategory.FOILING, False, 8),
    ("iQFOiL", BoatCategory.BOARD, True, 1),
    ("Formula Kite", BoatCategory.BOARD, True, 1),
]


class Command(BaseCommand):
    help = "Carga países, regiones náuticas y clases de embarcación."

    @transaction.atomic
    def handle(self, *args, **options):
        countries = {}
        for iso, name_es, name_en, continent, lat, lng in COUNTRIES:
            countries[iso], _ = Country.objects.update_or_create(
                iso_code=iso,
                defaults={
                    "name_es": name_es,
                    "name_en": name_en,
                    "continent": continent,
                    "latitude": lat,
                    "longitude": lng,
                },
            )

        for iso, name_es, name_en, lat, lng in REGIONS:
            Region.objects.update_or_create(
                country=countries[iso],
                slug=slugify(name_en),
                defaults={"name_es": name_es, "name_en": name_en, "latitude": lat, "longitude": lng},
            )

        for name, category, is_olympic, crew_size in BOAT_CLASSES:
            BoatClass.objects.update_or_create(
                slug=slugify(name),
                defaults={
                    "name": name,
                    "category": category,
                    "is_olympic": is_olympic,
                    "crew_size": crew_size,
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"{len(COUNTRIES)} países, {len(REGIONS)} regiones y {len(BOAT_CLASSES)} clases cargadas."
            )
        )
