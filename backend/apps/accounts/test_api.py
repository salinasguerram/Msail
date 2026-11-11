import time
from unittest import mock

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.geo.models import Continent, Country

from .models import SocialAccount

User = get_user_model()


class AuthAPITestCase(APITestCase):
    def setUp(self):
        cache.clear()  # reinicia el límite de intentos entre tests


class RegisterLoginTests(AuthAPITestCase):
    def setUp(self):
        super().setUp()
        Country.objects.create(iso_code="CL", name_es="Chile", name_en="Chile", continent=Continent.SOUTH_AMERICA)

    def register(self, **overrides):
        data = {
            "email": "Regatista@Example.com",
            "password": "vela-segura-123",
            "first_name": "Ana",
            "last_name": "Pérez",
            "country": "CL",
            "preferred_language": "en",
        }
        data.update(overrides)
        return self.client.post("/api/auth/register/", data, format="json")

    def test_register_returns_tokens_and_user(self):
        response = self.register()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["email"], "regatista@example.com")
        self.assertEqual(response.data["user"]["country"], "CL")
        self.assertNotIn("password", response.data["user"])

    def test_register_rejects_duplicate_email_any_case(self):
        self.register()
        response = self.register(email="REGATISTA@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_register_rejects_weak_password(self):
        response = self.register(password="123")
        self.assertEqual(response.status_code, 400)

    def test_login_is_case_insensitive(self):
        self.register()
        response = self.client.post(
            "/api/auth/login/", {"email": "REGATISTA@EXAMPLE.COM", "password": "vela-segura-123"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data)

    def test_login_wrong_password(self):
        self.register()
        response = self.client.post(
            "/api/auth/login/", {"email": "regatista@example.com", "password": "otra"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_me_requires_auth_and_can_update(self):
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        access = self.register().data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.patch("/api/auth/me/", {"first_name": "Anita", "email": "otro@x.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["first_name"], "Anita")
        self.assertEqual(response.data["email"], "regatista@example.com")  # el email no se cambia acá

    def test_me_tells_staff_and_cannot_grant_it(self):
        self.assertIs(self.register(is_staff=True).data["user"]["is_staff"], False)
        access = self.client.post(
            "/api/auth/login/", {"email": "regatista@example.com", "password": "vela-segura-123"}, format="json"
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertIs(self.client.patch("/api/auth/me/", {"is_staff": True}, format="json").data["is_staff"], False)
        User.objects.filter(email="regatista@example.com").update(is_staff=True)
        self.assertIs(self.client.get("/api/auth/me/").data["is_staff"], True)

    def test_refresh_and_logout(self):
        refresh = self.register().data["refresh"]
        rotated = self.client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(rotated.status_code, 200)
        new_refresh = rotated.data["refresh"]
        # El refresh viejo quedó invalidado por la rotación
        self.assertEqual(self.client.post("/api/auth/refresh/", {"refresh": refresh}, format="json").status_code, 401)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {rotated.data['access']}")
        logout = self.client.post("/api/auth/logout/", {"refresh": new_refresh}, format="json")
        self.assertEqual(logout.status_code, 205)
        after = self.client.post("/api/auth/refresh/", {"refresh": new_refresh}, format="json")
        self.assertEqual(after.status_code, 401)

    def test_login_is_throttled(self):
        for _ in range(10):
            self.client.post("/api/auth/login/", {"email": "a@b.com", "password": "x"}, format="json")
        response = self.client.post("/api/auth/login/", {"email": "a@b.com", "password": "x"}, format="json")
        self.assertEqual(response.status_code, 429)


@override_settings(GOOGLE_CLIENT_IDS=["google-ios-client"])
class GoogleLoginTests(AuthAPITestCase):
    def claims(self, **overrides):
        data = {
            "sub": "google-123",
            "aud": "google-ios-client",
            "email": "Navegante@Gmail.com",
            "email_verified": True,
            "given_name": "Juan",
            "family_name": "Mar",
        }
        data.update(overrides)
        return data

    def login(self, claims):
        with mock.patch("apps.accounts.social.google_id_token.verify_oauth2_token", return_value=claims):
            return self.client.post("/api/auth/google/", {"id_token": "fake"}, format="json")

    def test_creates_user_and_links_account(self):
        response = self.login(self.claims())
        self.assertEqual(response.status_code, 200, response.data)
        user = User.objects.get(email="navegante@gmail.com")
        self.assertEqual(user.first_name, "Juan")
        self.assertTrue(user.email_verified)
        self.assertFalse(user.has_usable_password())
        self.assertTrue(SocialAccount.objects.filter(user=user, provider="google", uid="google-123").exists())

    def test_second_login_reuses_user(self):
        self.login(self.claims())
        self.login(self.claims())
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(SocialAccount.objects.count(), 1)

    def test_links_existing_email_account(self):
        existing = User.objects.create_user(email="navegante@gmail.com", password="vela-segura-123")
        self.login(self.claims())
        self.assertEqual(SocialAccount.objects.get().user, existing)

    def test_rejects_other_audience(self):
        response = self.login(self.claims(aud="otra-app"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.count(), 0)

    def test_rejects_unverified_email(self):
        response = self.login(self.claims(email_verified=False))
        self.assertEqual(response.status_code, 400)

    def test_invalid_token(self):
        with mock.patch("apps.accounts.social.google_id_token.verify_oauth2_token", side_effect=ValueError("bad")):
            response = self.client.post("/api/auth/google/", {"id_token": "fake"}, format="json")
        self.assertEqual(response.status_code, 400)

    @override_settings(GOOGLE_CLIENT_IDS=[])
    def test_disabled_without_client_ids(self):
        response = self.client.post("/api/auth/google/", {"id_token": "x"}, format="json")
        self.assertEqual(response.status_code, 400)


@override_settings(APPLE_CLIENT_IDS=["com.exissailing.msailleague"])
class AppleLoginTests(AuthAPITestCase):
    """Firma tokens reales con una clave RSA de prueba para validar la verificación completa."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def token(self, key=None, **overrides):
        now = int(time.time())
        claims = {
            "iss": "https://appleid.apple.com",
            "aud": "com.exissailing.msailleague",
            "sub": "apple-001",
            "email": "abc@privaterelay.appleid.com",
            "email_verified": "true",
            "iat": now,
            "exp": now + 600,
        }
        claims.update(overrides)
        return jwt.encode(claims, key or self.private_key, algorithm="RS256")

    def login(self, token, **extra):
        signing_key = mock.Mock(key=self.private_key.public_key())
        with mock.patch("apps.accounts.social._apple_jwks.get_signing_key_from_jwt", return_value=signing_key):
            return self.client.post("/api/auth/apple/", {"id_token": token, **extra}, format="json")

    def test_creates_user_with_name_from_app(self):
        response = self.login(self.token(), first_name="Lucía", last_name="Vela")
        self.assertEqual(response.status_code, 200, response.data)
        user = User.objects.get(email="abc@privaterelay.appleid.com")
        self.assertEqual((user.first_name, user.last_name), ("Lucía", "Vela"))

    def test_rejects_wrong_audience(self):
        self.assertEqual(self.login(self.token(aud="com.otra.app")).status_code, 400)

    def test_rejects_wrong_issuer(self):
        self.assertEqual(self.login(self.token(iss="https://evil.example")).status_code, 400)

    def test_rejects_expired_token(self):
        self.assertEqual(self.login(self.token(exp=int(time.time()) - 10)).status_code, 400)

    def test_rejects_token_signed_with_other_key(self):
        other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.assertEqual(self.login(self.token(key=other)).status_code, 400)
        self.assertEqual(User.objects.count(), 0)
