from django.contrib.auth import get_user_model
from django.test import TestCase

User = get_user_model()


class UserManagerTests(TestCase):
    def test_create_user_with_email(self):
        user = User.objects.create_user(email="Nav@Example.com", password="vela-segura-123")
        self.assertEqual(user.email, "nav@example.com")
        self.assertTrue(user.check_password("vela-segura-123"))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.email_verified)
        self.assertEqual(user.preferred_language, "es")

    def test_email_is_required(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password="x")

    def test_create_superuser(self):
        admin = User.objects.create_superuser(email="admin@msail.com", password="vela-segura-123")
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
