import re
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import EmailCode

User = get_user_model()


def code_from(message):
    return re.search(r"\b(\d{6})\b", message.body).group(1)


class CodesTestCase(APITestCase):
    def setUp(self):
        cache.clear()

    def register(self, language="es"):
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "nav@example.com",
                "password": "vela-segura-123",
                "first_name": "Ana",
                "last_name": "Mar",
                "preferred_language": language,
            },
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response


class VerifyEmailTests(CodesTestCase):
    def test_register_sends_code_in_user_language(self):
        self.register(language="en")
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["nav@example.com"])
        self.assertIn("verification code", message.subject)
        self.assertIn("Welcome aboard, Ana", message.body)
        html = message.alternatives[0][0]
        self.assertIn(code_from(message), html)

    def test_spanish_email(self):
        self.register()
        self.assertIn("Bienvenido a bordo, Ana", mail.outbox[0].body)

    def test_code_is_not_stored_in_plain_text(self):
        self.register()
        code = code_from(mail.outbox[0])
        self.assertNotEqual(EmailCode.objects.get().code_hash, code)

    def test_verify_with_correct_code(self):
        self.register()
        response = self.client.post("/api/auth/verify-email/", {"code": code_from(mail.outbox[0])}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["email_verified"])
        self.assertTrue(User.objects.get().email_verified)

    def test_wrong_code(self):
        self.register()
        response = self.client.post("/api/auth/verify-email/", {"code": "000000"}, format="json")
        if code_from(mail.outbox[0]) != "000000":
            self.assertEqual(response.status_code, 400)
            self.assertFalse(User.objects.get().email_verified)

    def test_code_is_blocked_after_max_attempts(self):
        self.register()
        good = code_from(mail.outbox[0])
        bad = "111111" if good != "111111" else "222222"
        for _ in range(5):
            self.client.post("/api/auth/verify-email/", {"code": bad}, format="json")
        cache.clear()
        response = self.client.post("/api/auth/verify-email/", {"code": good}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_expired_code(self):
        self.register()
        EmailCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        response = self.client.post("/api/auth/verify-email/", {"code": code_from(mail.outbox[0])}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_resend_has_cooldown_and_invalidates_old_code(self):
        self.register()
        old = code_from(mail.outbox[0])
        self.assertEqual(self.client.post("/api/auth/verify-email/resend/").status_code, 429)

        EmailCode.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        self.assertEqual(self.client.post("/api/auth/verify-email/resend/").status_code, 200)
        new = code_from(mail.outbox[1])
        if old != new:
            self.assertEqual(
                self.client.post("/api/auth/verify-email/", {"code": old}, format="json").status_code, 400
            )
        self.assertEqual(self.client.post("/api/auth/verify-email/", {"code": new}, format="json").status_code, 200)

    def test_resend_when_already_verified(self):
        self.register()
        User.objects.update(email_verified=True)
        self.assertEqual(self.client.post("/api/auth/verify-email/resend/").status_code, 400)

    def test_verify_requires_login(self):
        response = self.client.post("/api/auth/verify-email/", {"code": "123456"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_registration_survives_email_failure(self):
        with mock.patch("apps.accounts.codes.EmailMultiAlternatives.send", side_effect=OSError("smtp caído")):
            with self.assertLogs("apps.accounts.views", level="ERROR"):
                response = self.register()
        self.assertEqual(response.status_code, 201)


class PasswordResetTests(CodesTestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email="nav@example.com", password="vieja-clave-123", first_name="Ana")

    def request_reset(self, email="nav@example.com"):
        return self.client.post("/api/auth/password-reset/", {"email": email}, format="json")

    def confirm(self, code, password="nueva-clave-456", email="nav@example.com"):
        return self.client.post(
            "/api/auth/password-reset/confirm/",
            {"email": email, "code": code, "new_password": password},
            format="json",
        )

    def test_same_response_for_unknown_email(self):
        known = self.request_reset()
        unknown = self.request_reset("nadie@example.com")
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_full_reset_flow(self):
        self.request_reset("NAV@example.com")
        self.assertIn("Recuperá tu contraseña", mail.outbox[0].subject)
        response = self.confirm(code_from(mail.outbox[0]))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("nueva-clave-456"))
        self.assertTrue(self.user.email_verified)

    def test_code_works_only_once(self):
        self.request_reset()
        code = code_from(mail.outbox[0])
        self.assertEqual(self.confirm(code).status_code, 200)
        self.assertEqual(self.confirm(code, password="otra-clave-789").status_code, 400)

    def test_weak_password_keeps_code_valid(self):
        self.request_reset()
        code = code_from(mail.outbox[0])
        self.assertEqual(self.confirm(code, password="123").status_code, 400)
        self.assertEqual(self.confirm(code).status_code, 200)

    def test_reset_closes_other_sessions(self):
        login = self.client.post(
            "/api/auth/login/", {"email": "nav@example.com", "password": "vieja-clave-123"}, format="json"
        )
        old_refresh = login.data["refresh"]
        self.request_reset()
        self.confirm(code_from(mail.outbox[0]))
        response = self.client.post("/api/auth/refresh/", {"refresh": old_refresh}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_verify_code_cannot_reset_password(self):
        self.client.force_authenticate(self.user)
        self.client.post("/api/auth/verify-email/resend/")
        self.client.force_authenticate(None)
        self.assertEqual(self.confirm(code_from(mail.outbox[0])).status_code, 400)

    def test_rejects_malformed_code(self):
        self.assertEqual(self.confirm("12ab").status_code, 400)
