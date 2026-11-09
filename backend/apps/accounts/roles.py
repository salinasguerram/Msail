"""
Roles del equipo de MSAIL en el panel de administración.

- Administradores: gestionan todo el contenido y los usuarios (sin ser superusuarios).
- Moderadores: revisan y corrigen contenido de la comunidad; no borran usuarios ni tocan permisos.

Cuando se sumen secciones nuevas (regatas, noticias, marinas...) se agregan acá sus modelos.
"""

from django.contrib.auth.models import Group, Permission

ADMINISTRATORS = "Administradores"
MODERATORS = "Moderadores"

# app_label → modelos que gestiona cada rol
ADMIN_MODELS = {
    "accounts": ["user", "socialaccount"],
    "geo": ["country", "region"],
    "sailing": ["boatclass", "club"],
    "profiles": ["sailorprofile", "raceresult"],
    "boats": ["boat", "crewmember"],
    "events": ["event", "eventcategory", "eventdocument", "eventresult", "eventmedia"],
    "notifications": ["notification"],
    "news": ["article"],
    "marinas": ["marina", "marinaphoto", "marinarate", "berthrequest"],
}

MODERATOR_PERMISSIONS = {
    "accounts": {"user": ["view", "change"]},
    "geo": {"country": ["view"], "region": ["view"]},
    "sailing": {"boatclass": ["view"], "club": ["view", "add", "change"]},
    "profiles": {"sailorprofile": ["view", "change"], "raceresult": ["view", "change", "delete"]},
    "boats": {"boat": ["view", "change"], "crewmember": ["view", "change", "delete"]},
    "events": {
        "event": ["view", "add", "change"],
        "eventcategory": ["view", "add", "change", "delete"],
        "eventdocument": ["view", "add", "change", "delete"],
        "eventresult": ["view", "add", "change", "delete"],
        "eventmedia": ["view", "add", "change", "delete"],
    },
    # Los moderadores escriben y corrigen noticias; borrar queda para los administradores.
    "news": {"article": ["view", "add", "change"]},
    "marinas": {"marina": ["view", "add", "change"], "marinaphoto": ["view", "add", "change", "delete"],
                "marinarate": ["view", "add", "change", "delete"],
                "berthrequest": ["view", "change"]},
}


def _permissions(app_label, model, actions):
    codenames = [f"{action}_{model}" for action in actions]
    return Permission.objects.filter(content_type__app_label=app_label, codename__in=codenames)


def setup_roles():
    """Crea o actualiza los grupos. Es idempotente: se corre después de cada migrate."""
    administrators, _ = Group.objects.get_or_create(name=ADMINISTRATORS)
    admin_perms = []
    for app_label, models in ADMIN_MODELS.items():
        for model in models:
            admin_perms += _permissions(app_label, model, ["view", "add", "change", "delete"])
    admin_perms += _permissions("auth", "group", ["view"])
    administrators.permissions.set(admin_perms)

    moderators, _ = Group.objects.get_or_create(name=MODERATORS)
    moderator_perms = []
    for app_label, models in MODERATOR_PERMISSIONS.items():
        for model, actions in models.items():
            moderator_perms += _permissions(app_label, model, actions)
    moderators.permissions.set(moderator_perms)

    return administrators, moderators
