from django.apps import AppConfig
from django.db.models.signals import post_migrate


def sync_roles(sender, **kwargs):
    # Los permisos de cada app se crean en su propio post_migrate, así que los roles
    # se sincronizan cada vez (es idempotente) para incluir los de todas las apps.
    from .roles import setup_roles

    setup_roles()


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.accounts'

    def ready(self):
        post_migrate.connect(sync_roles, dispatch_uid="msail_sync_roles")
