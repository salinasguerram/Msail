from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from apps.geo.models import Country

User = get_user_model()


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    }


class UserSerializer(serializers.ModelSerializer):
    country = serializers.SlugRelatedField(
        slug_field="iso_code",
        queryset=Country.objects.all(),
        required=False,
        allow_null=True,
    )
    # Tiene MSAIL Premium (la app muestra el distintivo y abre el contenido exclusivo).
    is_premium = serializers.SerializerMethodField()
    # Tiene contraseña (si entró con Google o Apple, no): la app sabe cómo pedir la confirmación al borrar la cuenta.
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "country",
            "preferred_language",
            "email_notifications",
            "email_verified",
            "date_joined",
            "is_staff",
            "is_premium",
            "has_password",
        ]
        # is_staff: la app muestra el acceso al panel de administración (solo lectura, se da desde el panel).
        read_only_fields = ["id", "email", "email_verified", "date_joined", "is_staff"]

    def get_has_password(self, user):
        return user.has_usable_password()

    def get_is_premium(self, user):
        from apps.premium.models import is_premium

        return is_premium(user)


class RegisterSerializer(UserSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["password"]
        read_only_fields = ["id", "email_verified", "date_joined", "is_staff"]
        extra_kwargs = {"first_name": {"required": True}, "last_name": {"required": True}}

    def validate_email(self, value):
        email = User.objects.normalize_email(value)
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError(_("Ya existe una cuenta con este email."))
        return email

    def validate(self, attrs):
        candidate = User(email=attrs["email"], first_name=attrs.get("first_name", ""))
        validate_password(attrs["password"], user=candidate)
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            email=User.objects.normalize_email(attrs["email"]),
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError(_("Email o contraseña incorrectos."), code="authorization")
        attrs["user"] = user
        return attrs


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class CodeField(serializers.RegexField):
    def __init__(self, **kwargs):
        super().__init__(r"^\s*\d{6}\s*$", error_messages={"invalid": _("El código tiene 6 dígitos.")}, **kwargs)


class VerifyEmailSerializer(serializers.Serializer):
    code = CodeField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = CodeField()
    new_password = serializers.CharField(write_only=True, style={"input_type": "password"})


class SocialLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField()
    # Apple solo manda el nombre a la app la primera vez; la app lo reenvía acá.
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
