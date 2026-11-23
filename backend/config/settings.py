"""
Configuración de Django para MSAIL LEAGUE.

Los valores sensibles se leen de variables de entorno (archivo .env en local).
Ver .env.example para la lista completa.
"""

import os
from datetime import timedelta
from pathlib import Path

import sys

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env(name, default=""):
    """Variable de entorno; una línea vacía en el .env (`CLAVE=`) cuenta como no definida."""
    return os.environ.get(name) or default


def env_bool(name, default=False):
    return env(name, str(default)).lower() in ("1", "true", "yes")


def env_list(name, default=""):
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


DEV_SECRET_KEY = "dev-insecure-solo-para-desarrollo-local-cambiar-en-produccion"
SECRET_KEY = env("DJANGO_SECRET_KEY", DEV_SECRET_KEY)

# En Vercel (que define VERCEL=1) el modo debug viene apagado si no se dice otra cosa.
ON_VERCEL = bool(env("VERCEL"))
DEBUG = env_bool("DJANGO_DEBUG", not ON_VERCEL)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
if ON_VERCEL:
    ALLOWED_HOSTS.append(".vercel.app")  # la dirección del proyecto y la de cada versión de prueba

if not DEBUG and SECRET_KEY == DEV_SECRET_KEY:
    from django.core.exceptions import ImproperlyConfigured

    raise ImproperlyConfigured("En producción hay que definir DJANGO_SECRET_KEY (una clave larga y aleatoria).")

# Detrás de Vercel (o cualquier proxy con https): se confía en el https que informa el proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# Direcciones desde las que se puede iniciar sesión en el panel (ej. https://msail-api.vercel.app).
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True


INSTALLED_APPS = [
    "unfold.apps.BasicAppConfig",  # tema del panel; "Basic" para que use el sitio propio de MSAIL
    "config.apps.MsailAdminConfig",  # admin de Django con el panel de MSAIL
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Terceros
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    # Propias
    "apps.core",  # utilidades compartidas y RLS en Supabase
    "apps.accounts",
    "apps.geo",
    "apps.sailing",
    "apps.profiles",
    "apps.boats",
    "apps.events",
    "apps.notifications",
    "apps.news",
    "apps.marinas",
    "apps.professionals",
    "apps.weather",
    "apps.map",
    "apps.msailing",
    "apps.premium",
    "apps.legal",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

# Orígenes de la versión web que pueden llamar a la API (las apps nativas no usan CORS).
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:8081")
CORS_ALLOW_HEADERS = ["accept", "accept-language", "authorization", "content-type"]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Base de datos: Supabase (PostgreSQL) vía DATABASE_URL; SQLite si no está definida.
DATABASES = {
    # `or`: si DATABASE_URL está vacía en el .env (como viene en el ejemplo), también se usa SQLite.
    "default": dj_database_url.parse(
        env("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        # En Vercel cada pedido puede correr en una máquina distinta: conexiones cortas (sin quedar abiertas).
        conn_max_age=0 if ON_VERCEL else 600,
    )
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Idiomas: español e inglés desde el día 1.
LANGUAGE_CODE = "es"
LANGUAGES = [
    ("es", "Español"),
    ("en", "English"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]

TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]  # ajustes propios del panel (static/msail/)

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    # Límites por acción (por IP si no hay sesión, por usuario si la hay).
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/min",
        "berth_request": "10/hour",
        "quote_request": "10/hour",
        "review": "20/hour",
        "register": "5/min",
        "refresh": "30/min",
        "send_code": "5/min",
        "verify_code": "10/min",
        "lookup": "20/min",
        "uploads": "30/hour",
        "weather": "120/min",
        "checkout": "20/hour",
    },
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
}

# La app guarda el refresh token en el almacenamiento seguro del celular,
# así la sesión queda abierta sin volver a pedir la contraseña.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=60),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}


# Login social: IDs de cliente aceptados como "audience" de los tokens.
# Google: los client ID de iOS, Android y web (Google Cloud > Credenciales).
# Apple: el bundle ID de la app y el Services ID de la web.
GOOGLE_CLIENT_IDS = env_list("GOOGLE_CLIENT_IDS")
APPLE_CLIENT_IDS = env_list("APPLE_CLIENT_IDS")


# Email: proveedor según EMAIL_PROVIDER o la clave cargada (Resend, SendGrid, Brevo o SMTP propio); sin clave,
# se muestra en la consola. Ver config/email.py y .env.example.
from config.email import email_settings  # noqa: E402

_email = email_settings(env)
EMAIL_PROVIDER = _email["EMAIL_PROVIDER"]
EMAIL_BACKEND = _email["EMAIL_BACKEND"]
EMAIL_HOST = _email["EMAIL_HOST"]
EMAIL_PORT = _email["EMAIL_PORT"]
EMAIL_HOST_USER = _email["EMAIL_HOST_USER"]
EMAIL_HOST_PASSWORD = _email["EMAIL_HOST_PASSWORD"]
EMAIL_USE_TLS = True
EMAIL_TIMEOUT = 15
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "MSAIL LEAGUE <no-reply@msailleague.com>")

# Códigos de verificación y recuperación de contraseña enviados por email.
EMAIL_CODE_TTL_MINUTES = 15
EMAIL_CODE_MAX_ATTEMPTS = 5
EMAIL_CODE_RESEND_SECONDS = 60


# Archivos subidos (fotos). En local se guardan en backend/media/; en producción, en Supabase Storage
# (compatible con S3). Se activa definiendo SUPABASE_STORAGE_BUCKET y sus credenciales.
SUPABASE_STORAGE_BUCKET = env("SUPABASE_STORAGE_BUCKET", "")
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
# Los tests guardan siempre en una carpeta temporal: nunca suben archivos al bucket real.
TESTING = sys.argv[1:2] == ["test"]
if SUPABASE_STORAGE_BUCKET and not TESTING:
    SUPABASE_PROJECT_URL = env("SUPABASE_PROJECT_URL", "").rstrip("/")  # https://<proyecto>.supabase.co
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": SUPABASE_STORAGE_BUCKET,
            "endpoint_url": f"{SUPABASE_PROJECT_URL}/storage/v1/s3",
            "region_name": env("SUPABASE_STORAGE_REGION", "us-east-1"),
            "access_key": env("SUPABASE_S3_ACCESS_KEY_ID", ""),
            "secret_key": env("SUPABASE_S3_SECRET_ACCESS_KEY", ""),
            # Bucket público: las fotos se sirven con URL fija, sin firma.
            "custom_domain": f"{SUPABASE_PROJECT_URL.removeprefix('https://')}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}",
            "querystring_auth": False,
            "file_overwrite": False,
        },
    }

# Fotos: tamaño máximo aceptado y lado máximo después de redimensionar.
PHOTO_MAX_UPLOAD_MB = 10
PHOTO_MAX_SIDE_PX = 1600
AVATAR_SIDE_PX = 512
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024


# Panel de administración (Unfold) con la identidad de MSAIL.
# "Ver el sitio" lleva a la app (en local, la versión web de Expo).
FRONTEND_URL = env("FRONTEND_URL", "http://localhost:8081")

# Cobro de MSAIL Premium con Stripe (ver apps/premium/stripe.py). Sin clave, los planes se ven pero no se pueden pagar.
# Tareas programadas de Vercel (apps/core/cron.py): Vercel manda este secreto al llamarlas.
CRON_SECRET = env("CRON_SECRET")

# Email de contacto que aparece en la política de privacidad y los términos.
LEGAL_CONTACT_EMAIL = env("LEGAL_CONTACT_EMAIL", "contacto@msailleague.com")

STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET")
# Email del equipo que recibe el aviso de cada solicitud de amarre nueva (vacío: solo se ve en el panel).
MARINA_REQUESTS_EMAIL = env("MARINA_REQUESTS_EMAIL")
# Email del equipo que recibe una copia de cada pedido de presupuesto (si no se define, usa el de amarres).
QUOTE_REQUESTS_EMAIL = env("QUOTE_REQUESTS_EMAIL") or MARINA_REQUESTS_EMAIL


def _static(path):
    from django.templatetags.static import static

    # Con la fecha del archivo en la URL: al cambiar el CSS o el JS del panel, el navegador no usa la copia vieja.
    try:
        version = int((BASE_DIR / "static" / path).stat().st_mtime)
    except OSError:
        return static(path)
    return f"{static(path)}?v={version}"


def _admin_link(title, icon, url_name):
    # El link es una función que Unfold llama al dibujar el menú (no un reverse_lazy): así la configuración se puede
    # leer y pasar a texto antes de que Django arranque, como hace Vercel al compilar.
    def link(request, name=url_name):
        from django.urls import reverse

        return reverse(name)

    return {"title": title, "icon": icon, "link": link}


UNFOLD = {
    "SITE_TITLE": "MSAIL",
    "SITE_HEADER": "MSAIL",
    "SITE_SUBHEADER": "Panel de administración",
    "SITE_URL": FRONTEND_URL,
    # Logo de velas (el mismo de la app y el ícono).
    "SITE_ICON": lambda request: _static("msail/sails.svg"),
    # Nombre nuevo del ícono: así el navegador no sigue mostrando el viejo que tenía guardado.
    "SITE_FAVICONS": [
        {"rel": "icon", "type": "image/png", "sizes": "192x192", "href": lambda request: _static("msail/favicon-velas.png")},
    ],
    "THEME": "dark",
    "BORDER_RADIUS": "10px",
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    # La barra lateral recuerda si quedó abierta también en notebooks (ver static/msail/).
    "STYLES": [lambda request: _static("msail/admin.css")],
    "SCRIPTS": [lambda request: _static("msail/admin-sidebar.js"), lambda request: _static("msail/admin-actions.js")],
    "LOGIN": {"form": "config.admin_site.MsailLoginForm"},
    "COLORS": {
        # Azul noche de la app (950 = fondo, 100 = texto)
        "base": {
            "50": "#f3f6fb",
            "100": "#e6edf7",
            "200": "#c4d0e3",
            "300": "#a9b6cc",
            "400": "#7f8fab",
            "500": "#4a5b7c",
            "600": "#2c3d5f",
            "700": "#1c2c4d",
            "800": "#11213f",
            "900": "#0b1730",
            "950": "#050b18",
        },
        # Azul eléctrico de MSAIL (500 = #2F8CFF)
        "primary": {
            "50": "#eaf3ff",
            "100": "#d4e6ff",
            "200": "#a9ceff",
            "300": "#7db5ff",
            "400": "#529dff",
            "500": "#2f8cff",
            "600": "#1f6fd6",
            "700": "#1958ad",
            "800": "#144485",
            "900": "#0f325f",
            "950": "#0a213f",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": False,
        "navigation": [
            {
                "title": "General",
                "items": [_admin_link("Resumen", "dashboard", "admin:index")],
            },
            {
                "title": "Calendario",
                "items": [
                    _admin_link("Regatas", "sailing", "admin:events_event_changelist"),
                    _admin_link("Tracks de carreras", "route", "admin:events_racetrack_changelist"),
                ],
            },
            {
                "title": "Contenido",
                "items": [_admin_link("Noticias", "newspaper", "admin:news_article_changelist")],
            },
            {
                "title": "Directorios",
                "items": [
                    _admin_link("Marinas", "anchor", "admin:marinas_marina_changelist"),
                    {
                        **_admin_link("Solicitudes de amarre", "move_to_inbox", "admin:marinas_berthrequest_changelist"),
                        "badge": "apps.marinas.admin.pending_badge",
                    },
                    _admin_link("Profesionales", "engineering", "admin:professionals_professional_changelist"),
                    {
                        **_admin_link("Pedidos de presupuesto", "request_quote", "admin:professionals_quoterequest_changelist"),
                        "badge": "apps.professionals.admin.pending_quotes_badge",
                    },
                    _admin_link("Reseñas", "reviews", "admin:professionals_review_changelist"),
                    _admin_link("Especialidades", "category", "admin:professionals_specialty_changelist"),
                ],
            },
            {
                "title": "MSailing",
                "items": [
                    _admin_link("Secciones", "article", "admin:msailing_section_changelist"),
                    _admin_link("Videos y lecciones", "smart_display", "admin:msailing_video_changelist"),
                    _admin_link("Aportes de la Fundación", "volunteer_activism", "admin:msailing_foundationsupport_changelist"),
                ],
            },
            {
                "title": "Legales",
                "items": [_admin_link("Privacidad y términos", "gavel", "admin:legal_legalpage_changelist")],
            },
            {
                "title": "Premium",
                "items": [
                    _admin_link("Suscripciones", "workspace_premium", "admin:premium_subscription_changelist"),
                    _admin_link("Planes", "sell", "admin:premium_plan_changelist"),
                ],
            },
            {
                "title": "Comunidad",
                "items": [
                    _admin_link("Usuarios", "person", "admin:accounts_user_changelist"),
                    _admin_link("Perfiles de navegante", "badge", "admin:profiles_sailorprofile_changelist"),
                    _admin_link("Resultados", "emoji_events", "admin:profiles_raceresult_changelist"),
                    _admin_link("Embarcaciones", "directions_boat", "admin:boats_boat_changelist"),
                    _admin_link("Avisos enviados", "notifications", "admin:notifications_notification_changelist"),
                ],
            },
            {
                "title": "Catálogos",
                "items": [
                    _admin_link("Clubes", "groups", "admin:sailing_club_changelist"),
                    _admin_link("Clases de embarcación", "category", "admin:sailing_boatclass_changelist"),
                    _admin_link("Países", "public", "admin:geo_country_changelist"),
                    _admin_link("Regiones náuticas", "location_on", "admin:geo_region_changelist"),
                ],
            },
            {
                "title": "Equipo MSAIL",
                "items": [_admin_link("Roles (grupos)", "admin_panel_settings", "admin:auth_group_changelist")],
            },
        ],
    },
}
