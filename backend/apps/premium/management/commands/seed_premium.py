"""
Planes de MSAIL Premium y algunas lecciones de ejemplo (gratis y Premium), para tener algo que mostrar.
No pisa nada: si ya hay planes o lecciones con ese título, los deja como están. Todo se edita desde el panel.

Uso: python manage.py seed_premium
"""

from django.core.management.base import BaseCommand

from apps.msailing.models import Video
from apps.premium.models import Plan
from apps.sailing.models import BoatClass

FEATURES_ES = """Videos y lecciones exclusivos para tu clase
Análisis de regatas y tácticas de los mejores
Contenido nuevo cada mes
Distintivo Premium en tu perfil"""
FEATURES_EN = """Exclusive videos and lessons for your class
Race analysis and tactics from the best
New content every month
Premium badge on your profile"""

# Precios de ejemplo: se cambian desde el panel (y tienen que coincidir con los de Stripe).
PLANS = [
    {"name_es": "Premium mensual", "name_en": "Premium monthly", "price": "9.99", "interval": "month", "order": 1},
    {"name_es": "Premium anual", "name_en": "Premium yearly", "price": "89.00", "interval": "year", "order": 2, "is_highlighted": True},
]

LESSONS = [
    {
        "title": "La largada: cómo elegir el lado de la línea",
        "description": "Cómo saber qué punta de la línea está favorecida y dónde ubicarte en los últimos minutos.",
        "body": "Antes de la señal de preparación, navegá la línea de punta a punta y orzá en el medio: la punta hacia la que "
        "apunta la proa cuando el barco queda proa al viento es la favorecida.\n\n"
        "Con la línea pareja, elegí el lado según el viento y la corriente del primer tramo, no según dónde larga la flota.\n\n"
        "En el último minuto lo importante es tener lugar a sotavento para acelerar: un hueco de un barco y medio alcanza.",
        "kind": "lesson",
        "level": "beginner",
        "classes": [],
        "is_premium": False,
    },
    {
        "title": "Optimist: trimado de la vela con viento fuerte",
        "description": "Sprit, botavara y escota para que el Optimist no se acueste cuando el viento sube.",
        "body": "Con más de 12 nudos tensá el sprit hasta que desaparezcan las arrugas del puño de driza: la vela se aplana y "
        "el barco escora menos.\n\n"
        "Bajá la botavara con el vang para que la baluma abra arriba y descargue la presión en las rachas.\n\n"
        "Navegá con el cuerpo bien afuera y soltá escota en las rachas en lugar de orzar: el barco tiene que seguir andando.",
        "kind": "lesson",
        "level": "intermediate",
        "classes": ["optimist"],
        "is_premium": False,
    },
    {
        "title": "ILCA: técnica de ceñida en ola",
        "description": "Cómo manejar el timón y el cuerpo para pasar la ola sin frenar el barco.",
        "body": "Subí la ola orzando un poco y caé al pasar la cresta, para bajar la ola con velocidad.\n\n"
        "Acompañá con el cuerpo: hacia atrás al subir la ola y hacia adelante al bajarla, sin mover el barco de golpe.\n\n"
        "Trabajá la escota en cada ola: un palmo afuera al caer, adentro de nuevo al orzar.",
        "kind": "lesson",
        "level": "advanced",
        "classes": ["ilca-4", "ilca-6", "ilca-7"],
        "is_premium": True,
    },
    {
        "title": "Táctica: cuándo virar con un role",
        "description": "Cómo leer los roles del viento y aprovecharlos en la ceñida.",
        "body": "Si el viento te hace caer (un borneo en contra), es momento de virar: en la otra amura vas a ir más alto.\n\n"
        "Tomá referencias con la brújula al largar: así sabés si estás en el rumbo alto o el bajo de cada amura.\n\n"
        "No vires en cada borneo chico: cada virada cuesta un par de largos de barco. Esperá que se confirme.",
        "kind": "lesson",
        "level": "intermediate",
        "classes": [],
        "is_premium": True,
    },
]


class Command(BaseCommand):
    help = "Crea los planes de MSAIL Premium y lecciones de ejemplo (sin pisar lo ya cargado)."

    def handle(self, *args, **options):
        plans = 0
        if not Plan.objects.exists():
            for values in PLANS:
                Plan.objects.create(features_es=FEATURES_ES, features_en=FEATURES_EN, currency="USD", **values)
                plans += 1
        lessons = 0
        for values in LESSONS:
            values = dict(values)
            slugs = values.pop("classes")
            video, created = Video.objects.get_or_create(title=values["title"], defaults=values)
            if created:
                video.boat_classes.set(BoatClass.objects.filter(slug__in=slugs))
                lessons += 1
        self.stdout.write(self.style.SUCCESS(f"Premium: {plans} planes y {lessons} lecciones nuevas."))
