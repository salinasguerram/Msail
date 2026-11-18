"""Proveedor de email del backend.

Se elige con EMAIL_PROVIDER, o solo según la clave que esté cargada (en este orden):
  - resend:   RESEND_API_KEY       (recomendado: 3.000 emails/mes gratis, se verifica el dominio y listo)
  - sendgrid: SENDGRID_API_KEY
  - brevo:    BREVO_SMTP_LOGIN + BREVO_SMTP_KEY
  - smtp:     EMAIL_HOST, EMAIL_HOST_USER y EMAIL_HOST_PASSWORD (cualquier cuenta, ej. Gmail para pruebas)
Sin ninguna clave, los emails no se envían: se muestran en la consola donde corre Django.
"""

PRESETS = {
    # Usuario fijo "resend" y la API key como contraseña.
    "resend": {"host": "smtp.resend.com", "port": 587, "user": "resend", "password_var": "RESEND_API_KEY"},
    # Usuario fijo "apikey" y la API key como contraseña.
    "sendgrid": {"host": "smtp.sendgrid.net", "port": 587, "user": "apikey", "password_var": "SENDGRID_API_KEY"},
    # Usuario y clave SMTP que da Brevo en "SMTP & API".
    "brevo": {"host": "smtp-relay.brevo.com", "port": 587, "user_var": "BREVO_SMTP_LOGIN", "password_var": "BREVO_SMTP_KEY"},
}

SMTP_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
CONSOLE_BACKEND = "django.core.mail.backends.console.EmailBackend"


def _detect(env):
    if env("RESEND_API_KEY"):
        return "resend"
    if env("SENDGRID_API_KEY"):
        return "sendgrid"
    if env("BREVO_SMTP_KEY"):
        return "brevo"
    if env("EMAIL_HOST_PASSWORD"):
        return "smtp"
    return "console"


def email_settings(env):
    """Arma la configuración de email a partir de `env(nombre) -> valor o ""`."""
    provider = (env("EMAIL_PROVIDER") or _detect(env)).strip().lower()
    if provider in PRESETS:
        preset = PRESETS[provider]
        host, port = preset["host"], preset["port"]
        user = env(preset["user_var"]) if "user_var" in preset else preset["user"]
        password = env(preset["password_var"])
    elif provider == "smtp":
        host, port = env("EMAIL_HOST") or "localhost", int(env("EMAIL_PORT") or 587)
        user, password = env("EMAIL_HOST_USER"), env("EMAIL_HOST_PASSWORD")
    else:
        provider, host, port, user, password = "console", "localhost", 587, "", ""
    sending = provider != "console" and bool(password)
    return {
        "EMAIL_PROVIDER": provider if sending else "console",
        "EMAIL_BACKEND": env("EMAIL_BACKEND") or (SMTP_BACKEND if sending else CONSOLE_BACKEND),
        "EMAIL_HOST": host,
        "EMAIL_PORT": port,
        "EMAIL_HOST_USER": user or "",
        "EMAIL_HOST_PASSWORD": password or "",
    }
