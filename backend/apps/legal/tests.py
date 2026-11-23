from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.boats.models import Boat
from apps.premium import stripe
from apps.premium.models import Subscription

User = get_user_model()


@override_settings(LEGAL_CONTACT_EMAIL="privacidad@msail.test")
class LegalPagesTests(APITestCase):
    def test_pages_are_public_in_both_languages(self):
        call_command("seed_legal", stdout=StringIO())
        call_command("seed_legal", stdout=StringIO())  # no duplica ni pisa
        page = self.client.get("/api/legal/privacy/").data
        self.assertEqual(page["title"], "Política de privacidad")
        self.assertIn("privacidad@msail.test", page["body"])
        self.assertNotIn("{contacto}", page["body"])
        english = self.client.get("/api/legal/terms/", HTTP_ACCEPT_LANGUAGE="en").data
        self.assertEqual(english["title"], "Terms and conditions")
        self.assertEqual(self.client.get("/api/legal/otra/").status_code, 404)

    def test_admin_lists_legal_pages(self):
        call_command("seed_legal", stdout=StringIO())
        admin = User.objects.create_superuser(email="root@msail.test", password="clave-segura-123")
        self.client.force_login(admin)
        self.assertEqual(self.client.get("/admin/legal/legalpage/").status_code, 200)


class DeleteAccountTests(APITestCase):
    URL = "/api/auth/delete-account/"

    def setUp(self):
        self.user = User.objects.create_user(email="ana@example.com", password="clave-segura-123")
        Boat.objects.create(owner=self.user, name="Brisa")
        self.client.force_authenticate(self.user)

    def test_needs_the_right_password(self):
        response = self.client.post(self.URL, {"password": "otra"})
        self.assertEqual(response.status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_deletes_account_and_data(self):
        self.assertEqual(self.client.post(self.URL, {"password": "clave-segura-123"}).status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertFalse(Boat.objects.filter(name="Brisa").exists())

    def test_social_accounts_confirm_with_email(self):
        self.user.set_unusable_password()
        self.user.save()
        self.assertEqual(self.client.post(self.URL, {"email": "otro@example.com"}).status_code, 400)
        self.assertEqual(self.client.post(self.URL, {"email": "ANA@example.com "}).status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())

    def test_superusers_cannot_delete_themselves(self):
        root = User.objects.create_superuser(email="root@msail.test", password="clave-segura-123")
        self.client.force_authenticate(root)
        self.assertEqual(self.client.post(self.URL, {"password": "clave-segura-123"}).status_code, 400)

    @override_settings(STRIPE_SECRET_KEY="sk_test_x")
    def test_cancels_stripe_subscription_first(self):
        Subscription.objects.create(user=self.user, stripe_subscription_id="sub_1", stripe_customer_id="cus_1")
        with mock.patch.object(stripe, "_call", side_effect=stripe.StripeError("caído")):
            self.assertEqual(self.client.post(self.URL, {"password": "clave-segura-123"}).status_code, 502)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())  # no se borra si se le seguiría cobrando
        with mock.patch.object(stripe, "_call", return_value={}) as call:
            self.assertEqual(self.client.post(self.URL, {"password": "clave-segura-123"}).status_code, 204)
        call.assert_called_once_with("DELETE", "/subscriptions/sub_1")
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
