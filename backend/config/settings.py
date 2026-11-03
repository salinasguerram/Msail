"""
Configuración de Django para MSAIL LEAGUE.

Los valores sensibles se leen de variables de entorno (archivo .env en local).
Ver .env.example para la lista completa.
"""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    return os.getenv(name, str(default)).lower() in ("1", "true", "yes")


def env_list(name, default=""):
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-insecure-solo-para-desarrollo-local-cambiar-en-produccion")

DEBUG = env_bool("DJANGO_DEBUG", True)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")


INSTALLED_APPS = [
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
    "apps.accounts",
    "apps.geo",
    "apps.sailing",
    "apps.profiles",
    "apps.boats",
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
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
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
    "DEFAULT_THROTTLE_RATES": {
        "auth": "10/min",
        "uploads": "30/hour",
    },
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


# Email: en local se imprime en la consola; en producción sale por Twilio SendGrid (SMTP).
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.sendgrid.net")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "apikey")
EMAIL_HOST_PASSWORD = os.getenv("SENDGRID_API_KEY", "")
EMAIL_USE_TLS = True
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "MSAIL LEAGUE <no-reply@msailleague.com>")

# Códigos de verificación y recuperación de contraseña enviados por email.
EMAIL_CODE_TTL_MINUTES = 15
EMAIL_CODE_MAX_ATTEMPTS = 5
EMAIL_CODE_RESEND_SECONDS = 60


# Archivos subidos (fotos). En local se guardan en backend/media/; en producción, en Supabase Storage
# (compatible con S3). Se activa definiendo SUPABASE_STORAGE_BUCKET y sus credenciales.
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "")
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
if SUPABASE_STORAGE_BUCKET:
    SUPABASE_PROJECT_URL = os.getenv("SUPABASE_PROJECT_URL", "").rstrip("/")  # https://<proyecto>.supabase.co
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": SUPABASE_STORAGE_BUCKET,
            "endpoint_url": f"{SUPABASE_PROJECT_URL}/storage/v1/s3",
            "region_name": os.getenv("SUPABASE_STORAGE_REGION", "us-east-1"),
            "access_key": os.getenv("SUPABASE_S3_ACCESS_KEY_ID", ""),
            "secret_key": os.getenv("SUPABASE_S3_SECRET_ACCESS_KEY", ""),
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
