from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"

    def ready(self):
        # Tablas nuevas: RLS activado al terminar cada migrate (ver rls.py).
        from .rls import connect_rls

        connect_rls()
