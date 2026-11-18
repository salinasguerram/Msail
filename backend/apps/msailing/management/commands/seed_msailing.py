"""
Textos iniciales de la página MSailing (Quiénes somos, Escuela, La Fundación).

Uso: python manage.py seed_msailing
Solo crea las secciones que faltan: nunca pisa lo que se editó desde el panel.
Son textos de base para que la página no quede vacía; el equipo los reemplaza por los definitivos.
"""

from django.core.management.base import BaseCommand

from apps.msailing.models import Section, SectionKey

SECTIONS = {
    SectionKey.ABOUT: {
        "title_es": "Quiénes somos",
        "title_en": "About us",
        "body_es": (
            "MSailing es la marca de EXISSAILING LLC dedicada al mundo de la vela.\n\n"
            "Reunimos en un solo lugar a navegantes, regatistas, clubes, marinas y profesionales: "
            "el calendario de eventos, el clima, los servicios y la comunidad que hace crecer este deporte."
        ),
        "body_en": (
            "MSailing is the EXISSAILING LLC brand dedicated to the world of sailing.\n\n"
            "We bring sailors, racers, clubs, marinas and professionals together in one place: "
            "the events calendar, the weather, services and the community that makes this sport grow."
        ),
    },
    SectionKey.SCHOOL: {
        "title_es": "Escuela de vela y formación",
        "title_en": "Sailing school and training",
        "body_es": (
            "Cursos y entrenamientos para todos los niveles: desde los primeros pasos a bordo hasta la preparación para regatas.\n\n"
            "Pronto vas a poder ver los cursos disponibles, sus fechas y anotarte desde la app."
        ),
        "body_en": (
            "Courses and training for every level: from your first steps on board to racing preparation.\n\n"
            "Soon you'll be able to see the available courses and their dates, and sign up from the app."
        ),
    },
    SectionKey.FOUNDATION: {
        "title_es": "La Fundación",
        "title_en": "The Foundation",
        "body_es": (
            "La Fundación MSailing acompaña a deportistas con apoyo solidario para entrenar, viajar y competir.\n\n"
            "Acá publicamos a quién apoyamos y para qué se usa cada aporte, para que el destino de los fondos sea transparente."
        ),
        "body_en": (
            "The MSailing Foundation supports athletes so they can train, travel and compete.\n\n"
            "Here we publish who we support and what each contribution is used for, so the use of funds is transparent."
        ),
        "cta_label_es": "Quiero colaborar",
        "cta_label_en": "I want to help",
    },
}


class Command(BaseCommand):
    help = "Crea los textos iniciales de la página MSailing (sin pisar lo ya editado)."

    def handle(self, *args, **options):
        created = 0
        for key, values in SECTIONS.items():
            _section, was_created = Section.objects.get_or_create(key=key, defaults=values)
            created += was_created
        self.stdout.write(self.style.SUCCESS(f"Secciones MSailing: {created} nuevas, {len(SECTIONS) - created} ya existían."))
