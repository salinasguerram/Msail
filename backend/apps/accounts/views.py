import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.translation import gettext_lazy as _
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .codes import CodeCooldown, CodeError, consume_code, issue_code
from .models import EmailCode, SocialAccount
from .serializers import (
    LoginSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    SocialLoginSerializer,
    UserSerializer,
    VerifyEmailSerializer,
    tokens_for,
)
from .social import SocialAuthError, get_or_create_social_user, verify_apple_token, verify_google_token

logger = logging.getLogger(__name__)
User = get_user_model()

INVALID_CODE = {"code": [_("Código incorrecto o vencido.")]}


def cooldown_response(exc):
    return Response(
        {"detail": _("Esperá unos segundos antes de pedir otro código."), "retry_after": exc.seconds},
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def revoke_sessions(user):
    """Cierra todas las sesiones abiertas del usuario en todos sus dispositivos."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class AuthView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class RegisterView(AuthView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        try:
            issue_code(user, EmailCode.Purpose.VERIFY_EMAIL, enforce_cooldown=False)
        except Exception:
            # Si falla el envío la cuenta queda creada; el usuario puede pedir reenvío.
            logger.exception("No se pudo enviar el email de verificación a %s", user.email)
        return Response(tokens_for(user), status=status.HTTP_201_CREATED)


class LoginView(AuthView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return Response(tokens_for(serializer.validated_data["user"]))


class RefreshView(TokenRefreshView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class LogoutView(APIView):
    """Invalida el refresh token para cerrar la sesión en ese dispositivo."""

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            pass  # ya vencido o inválido: la sesión ya está cerrada
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class VerifyEmailView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.email_verified:
            with transaction.atomic():
                try:
                    consume_code(user, EmailCode.Purpose.VERIFY_EMAIL, serializer.validated_data["code"])
                except CodeError:
                    return Response(INVALID_CODE, status=status.HTTP_400_BAD_REQUEST)
                user.email_verified = True
                user.save(update_fields=["email_verified"])
        return Response(UserSerializer(user).data)


class ResendVerificationView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        if request.user.email_verified:
            return Response({"detail": _("El email ya está verificado.")}, status=status.HTTP_400_BAD_REQUEST)
        try:
            issue_code(request.user, EmailCode.Purpose.VERIFY_EMAIL)
        except CodeCooldown as exc:
            return cooldown_response(exc)
        return Response({"detail": _("Te enviamos un nuevo código.")})


class PasswordResetRequestView(AuthView):
    """Siempre responde lo mismo, exista o no la cuenta, para no revelar qué emails están registrados."""

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = User.objects.normalize_email(serializer.validated_data["email"])
        user = User.objects.filter(email=email, is_active=True).first()
        if user:
            try:
                issue_code(user, EmailCode.Purpose.RESET_PASSWORD)
            except CodeCooldown:
                pass
        return Response({"detail": _("Si el email está registrado, te enviamos un código.")})


class PasswordResetConfirmView(AuthView):
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User.objects.filter(email=User.objects.normalize_email(data["email"]), is_active=True).first()
        if user is None:
            return Response(INVALID_CODE, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(data["new_password"], user=user)
        except DjangoValidationError as exc:
            return Response({"new_password": exc.messages}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            try:
                consume_code(user, EmailCode.Purpose.RESET_PASSWORD, data["code"])
            except CodeError:
                return Response(INVALID_CODE, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(data["new_password"])
            user.email_verified = True  # recibir el código prueba que el email es suyo
            user.save(update_fields=["password", "email_verified"])
            revoke_sessions(user)
        return Response(tokens_for(user))


class SocialLoginView(AuthView):
    provider = None
    verify = None

    def post(self, request):
        serializer = SocialLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            identity = type(self).verify(data["id_token"])
            user = get_or_create_social_user(
                self.provider,
                identity,
                first_name=data.get("first_name", ""),
                last_name=data.get("last_name", ""),
            )
        except SocialAuthError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if not user.is_active:
            return Response({"detail": _("Cuenta desactivada.")}, status=status.HTTP_403_FORBIDDEN)
        return Response(tokens_for(user))


class GoogleLoginView(SocialLoginView):
    provider = SocialAccount.Provider.GOOGLE
    verify = staticmethod(verify_google_token)


class AppleLoginView(SocialLoginView):
    provider = SocialAccount.Provider.APPLE
    verify = staticmethod(verify_apple_token)
