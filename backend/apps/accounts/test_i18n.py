from django.core.cache import cache
from rest_framework.test import APITestCase


class ApiLanguageTests(APITestCase):
    """La API responde en el idioma que pide la app con Accept-Language."""

    def setUp(self):
        cache.clear()

    def login(self, language):
        return self.client.post(
            "/api/auth/login/",
            {"email": "nadie@example.com", "password": "x"},
            format="json",
            HTTP_ACCEPT_LANGUAGE=language,
        )

    def test_spanish(self):
        self.assertEqual(self.login("es").data["non_field_errors"][0], "Email o contraseña incorrectos.")

    def test_english(self):
        self.assertEqual(self.login("en").data["non_field_errors"][0], "Incorrect email or password.")

    def test_django_messages_in_english(self):
        response = self.client.post("/api/auth/login/", {}, format="json", HTTP_ACCEPT_LANGUAGE="en")
        self.assertEqual(response.data["email"][0], "This field is required.")
