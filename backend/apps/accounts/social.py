"""
Verificación de tokens de Google y Apple, y alta o vinculación del usuario.

La app hace el login nativo con Google o Apple y manda el `id_token` que recibe.
Acá se valida la firma, el emisor y la audiencia antes de confiar en su contenido.
"""

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.translation import gettext_lazy as _
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from .models import SocialAccount

User = get_user_model()

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"

_apple_jwks = jwt.PyJWKClient(APPLE_KEYS_URL, cache_keys=True)


class SocialAuthError(Exception):
    pass


def _as_bool(value):
    # Apple a veces manda "true"/"false" como texto.
    return value is True or str(value).lower() == "true"


def verify_google_token(token):
    if not settings.GOOGLE_CLIENT_IDS:
        raise SocialAuthError(_("El login con Google no está configurado."))
    try:
        claims = google_id_token.verify_oauth2_token(token, google_requests.Request())
    except ValueError as exc:
        raise SocialAuthError(_("Token de Google inválido.")) from exc
    if claims.get("aud") not in settings.GOOGLE_CLIENT_IDS:
        raise SocialAuthError(_("Token de Google emitido para otra aplicación."))
    return {
        "uid": claims["sub"],
        "email": claims.get("email"),
        "email_verified": _as_bool(claims.get("email_verified")),
        "first_name": claims.get("given_name", ""),
        "last_name": claims.get("family_name", ""),
    }


def verify_apple_token(token):
    if not settings.APPLE_CLIENT_IDS:
        raise SocialAuthError(_("El login con Apple no está configurado."))
    try:
        signing_key = _apple_jwks.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.APPLE_CLIENT_IDS,
            issuer=APPLE_ISSUER,
        )
    except jwt.PyJWTError as exc:
        raise SocialAuthError(_("Token de Apple inválido.")) from exc
    return {
        "uid": claims["sub"],
        "email": claims.get("email"),
        "email_verified": _as_bool(claims.get("email_verified")),
        "first_name": "",
        "last_name": "",
    }


@transaction.atomic
def get_or_create_social_user(provider, identity, first_name="", last_name=""):
    """
    1. Si la cuenta social ya está vinculada, devuelve ese usuario.
    2. Si no, y el proveedor confirma el email, vincula con el usuario de ese email o crea uno nuevo.
    """
    account = SocialAccount.objects.select_related("user").filter(provider=provider, uid=identity["uid"]).first()
    if account:
        return account.user

    email = User.objects.normalize_email(identity["email"])
    if not email or not identity["email_verified"]:
        raise SocialAuthError(_("El proveedor no confirmó el email de la cuenta."))

    user = User.objects.filter(email=email).first()
    if user is None:
        user = User.objects.create_user(
            email=email,
            password=None,  # sin contraseña: solo entra por el proveedor hasta que defina una
            first_name=first_name or identity["first_name"],
            last_name=last_name or identity["last_name"],
        )
    if not user.email_verified:
        user.email_verified = True
        user.save(update_fields=["email_verified"])

    SocialAccount.objects.create(user=user, provider=provider, uid=identity["uid"])
    return user
