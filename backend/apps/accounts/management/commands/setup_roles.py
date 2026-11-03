from django.core.management.base import BaseCommand

from apps.accounts.roles import setup_roles


class Command(BaseCommand):
    help = "Crea o actualiza los grupos Administradores y Moderadores con sus permisos."

    def handle(self, *args, **options):
        administrators, moderators = setup_roles()
        self.stdout.write(
            self.style.SUCCESS(
                f"{administrators.name}: {administrators.permissions.count()} permisos · "
                f"{moderators.name}: {moderators.permissions.count()} permisos"
            )
        )
