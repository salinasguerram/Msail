from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Manda un email de prueba para comprobar el proveedor configurado (ej. después de pasar a Resend)."

    def add_arguments(self, parser):
        parser.add_argument("to", help="Dirección que recibe la prueba.")

    def handle(self, *args, **options):
        provider = settings.EMAIL_PROVIDER
        self.stdout.write(f"Proveedor: {provider} · Remitente: {settings.DEFAULT_FROM_EMAIL}")
        if provider == "console":
            self.stdout.write(self.style.WARNING("No hay clave de email cargada: el mensaje se muestra acá abajo y no se envía."))
        send_mail(
            "MSAIL LEAGUE · Email de prueba",
            "Si recibiste este mensaje, el envío de emails de MSAIL LEAGUE está bien configurado.",
            settings.DEFAULT_FROM_EMAIL,
            [options["to"]],
        )
        self.stdout.write(self.style.SUCCESS(f"Enviado a {options['to']}."))
