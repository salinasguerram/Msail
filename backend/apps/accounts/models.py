from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils.translation import gettext_lazy as _


class UserManager(BaseUserManager):
    """Manager para usuarios que inician sesión con email en lugar de username."""

    use_in_migrations = True

    @classmethod
    def normalize_email(cls, email):
        # Todo en minúsculas para que el login no dependa de mayúsculas.
        return (email or "").strip().lower()

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError(_("El email es obligatorio."))
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields["is_staff"] or not extra_fields["is_superuser"]:
            raise ValueError(_("El superusuario necesita is_staff e is_superuser."))
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Usuario de MSAIL LEAGUE. El perfil de navegante se agrega en la semana 2."""

    username = None
    email = models.EmailField(_("email"), unique=True)
    email_verified = models.BooleanField(_("email verificado"), default=False)
    preferred_language = models.CharField(
        _("idioma preferido"),
        max_length=5,
        choices=settings.LANGUAGES,
        default="es",
    )
    country = models.ForeignKey(
        "geo.Country",
        verbose_name=_("país"),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        verbose_name = _("usuario")
        verbose_name_plural = _("usuarios")

    def __str__(self):
        return self.email


class EmailCode(models.Model):
    """Código de 6 dígitos enviado por email. Se guarda solo su hash."""

    class Purpose(models.TextChoices):
        VERIFY_EMAIL = "verify_email", _("Verificar email")
        RESET_PASSWORD = "reset_password", _("Recuperar contraseña")

    user = models.ForeignKey(
        User,
        verbose_name=_("usuario"),
        on_delete=models.CASCADE,
        related_name="email_codes",
    )
    purpose = models.CharField(_("motivo"), max_length=20, choices=Purpose.choices)
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(_("intentos"), default=0)
    expires_at = models.DateTimeField(_("vence"))
    used_at = models.DateTimeField(_("usado"), null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("código por email")
        verbose_name_plural = _("códigos por email")
        indexes = [models.Index(fields=["user", "purpose", "-created_at"])]

    def __str__(self):
        return f"{self.get_purpose_display()} · {self.user.email}"


class SocialAccount(models.Model):
    """Cuenta de Google o Apple vinculada a un usuario."""

    class Provider(models.TextChoices):
        GOOGLE = "google", "Google"
        APPLE = "apple", "Apple"

    user = models.ForeignKey(
        User,
        verbose_name=_("usuario"),
        on_delete=models.CASCADE,
        related_name="social_accounts",
    )
    provider = models.CharField(_("proveedor"), max_length=20, choices=Provider.choices)
    uid = models.CharField(_("ID en el proveedor"), max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("cuenta social")
        verbose_name_plural = _("cuentas sociales")
        constraints = [
            models.UniqueConstraint(fields=["provider", "uid"], name="unique_social_account"),
        ]

    def __str__(self):
        return f"{self.get_provider_display()} · {self.user.email}"
