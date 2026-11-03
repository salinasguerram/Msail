"""
Emisión, envío y validación de códigos por email (verificación de cuenta y recuperación de contraseña).

Se usa un código de 6 dígitos en lugar de un link porque el usuario lo tipea en la app,
sin depender de que el link abra la app instalada.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone, translation
from django.utils.crypto import constant_time_compare

from .models import EmailCode

SUBJECTS = {
    EmailCode.Purpose.VERIFY_EMAIL: {
        "es": "Tu código de verificación de MSAIL LEAGUE",
        "en": "Your MSAIL LEAGUE verification code",
    },
    EmailCode.Purpose.RESET_PASSWORD: {
        "es": "Recuperá tu contraseña de MSAIL LEAGUE",
        "en": "Reset your MSAIL LEAGUE password",
    },
}


class CodeError(Exception):
    pass


class CodeCooldown(CodeError):
    def __init__(self, seconds):
        self.seconds = seconds
        super().__init__(seconds)


def _hash(code):
    return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


def _language(user):
    return "en" if (user.preferred_language or "").startswith("en") else "es"


def issue_code(user, purpose, *, enforce_cooldown=True):
    """Invalida los códigos anteriores, crea uno nuevo y lo envía. Devuelve el código (para tests)."""
    now = timezone.now()
    latest = EmailCode.objects.filter(user=user, purpose=purpose).order_by("-created_at").first()
    if enforce_cooldown and latest:
        elapsed = (now - latest.created_at).total_seconds()
        if elapsed < settings.EMAIL_CODE_RESEND_SECONDS:
            raise CodeCooldown(int(settings.EMAIL_CODE_RESEND_SECONDS - elapsed) + 1)

    EmailCode.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(used_at=now)
    code = f"{secrets.randbelow(10**6):06d}"
    EmailCode.objects.create(
        user=user,
        purpose=purpose,
        code_hash=_hash(code),
        expires_at=now + timedelta(minutes=settings.EMAIL_CODE_TTL_MINUTES),
    )
    _send(user, purpose, code)
    return code


def consume_code(user, purpose, code):
    """Valida el código y lo marca como usado. Lanza CodeError si no es válido."""
    entry = (
        EmailCode.objects.select_for_update()
        .filter(user=user, purpose=purpose, used_at__isnull=True, expires_at__gt=timezone.now())
        .order_by("-created_at")
        .first()
    )
    if entry is None or entry.attempts >= settings.EMAIL_CODE_MAX_ATTEMPTS:
        raise CodeError()
    if not constant_time_compare(entry.code_hash, _hash(code.strip())):
        entry.attempts += 1
        entry.save(update_fields=["attempts"])
        raise CodeError()
    entry.used_at = timezone.now()
    entry.save(update_fields=["used_at"])


def _send(user, purpose, code):
    language = _language(user)
    context = {
        "user": user,
        "code": code,
        "ttl_minutes": settings.EMAIL_CODE_TTL_MINUTES,
    }
    with translation.override(language):
        template = f"accounts/emails/{purpose}.{language}"
        text = render_to_string(f"{template}.txt", context)
        html = render_to_string(f"{template}.html", context)
    message = EmailMultiAlternatives(
        subject=SUBJECTS[purpose][language],
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    message.attach_alternative(html, "text/html")
    message.send()
