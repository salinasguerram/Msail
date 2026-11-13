"""Seguridad a nivel de fila (RLS) en Supabase.

Supabase expone todas las tablas del esquema `public` por su API automática (PostgREST), con la clave pública
del proyecto. La app no usa esa API: Django se conecta directo como dueño de las tablas, y al dueño no lo limita
RLS. Por eso alcanza con activar RLS sin ninguna regla: la API no puede leer ni escribir nada y Django sigue igual.
"""

from django.db import connections
from django.db.models.signals import post_migrate


def enable_rls(using="default"):
    """Activa RLS en las tablas de `public` que todavía no lo tienen. Devuelve los nombres de las tablas cambiadas."""
    connection = connections[using]
    if connection.vendor != "postgresql":
        return []
    with connection.cursor() as cursor:
        cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity")
        tables = [row[0] for row in cursor.fetchall()]
        for table in tables:
            cursor.execute(f"ALTER TABLE public.{connection.ops.quote_name(table)} ENABLE ROW LEVEL SECURITY")
    return tables


def _after_migrate(sender, using="default", **kwargs):
    # post_migrate llega una vez por app (solo las que tienen modelos). La primera activa RLS donde falte;
    # las siguientes no encuentran nada pendiente y no hacen cambios.
    enable_rls(using)


def connect_rls():
    post_migrate.connect(_after_migrate, dispatch_uid="msail_enable_rls")
