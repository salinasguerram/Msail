"""Tests de las correcciones pedidas después de probar las semanas 1 y 2."""

from io import StringIO

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.boats.models import Boat, CrewMember
from apps.geo.models import Country, Region
from apps.profiles.models import RaceResult, SailorProfile

User = get_user_model()


class ThrottleScopesTests(APITestCase):
    """A: pedir códigos de recuperación ya no bloquea el login de otra cuenta."""

    def setUp(self):
        cache.clear()
        User.objects.create_user(email="otra@example.com", password="vela-segura-123")

    def test_password_reset_does_not_block_login(self):
        for _ in range(6):
            self.client.post("/api/auth/password-reset/", {"email": "rodri@example.com"}, format="json")
        blocked = self.client.post("/api/auth/password-reset/", {"email": "rodri@example.com"}, format="json")
        self.assertEqual(blocked.status_code, 429)
        self.assertGreater(blocked.data["retry_after"], 0)

        login = self.client.post("/api/auth/login/", {"email": "otra@example.com", "password": "vela-segura-123"}, format="json")
        self.assertEqual(login.status_code, 200, login.data)

    def test_login_limit_reports_wait(self):
        for _ in range(10):
            self.client.post("/api/auth/login/", {"email": "a@b.com", "password": "x"}, format="json")
        response = self.client.post("/api/auth/login/", {"email": "a@b.com", "password": "x"}, format="json")
        self.assertEqual(response.status_code, 429)
        self.assertIn("retry_after", response.data)


class CrewLookupTests(APITestCase):
    """F: el tripulante se busca por email exacto; dos personas con el mismo nombre no se confunden."""

    @classmethod
    def setUpTestData(cls):
        cls.me = User.objects.create_user(email="yo@example.com", password="x-segura-123", first_name="Rodrigo", last_name="Martínez")
        cls.ana = User.objects.create_user(email="ana@example.com", password="x-segura-123", first_name="Ana", last_name="Pérez")
        cls.ana_twin = User.objects.create_user(email="ana.perez@otro.com", password="x-segura-123", first_name="Ana", last_name="Pérez")
        cls.private = User.objects.create_user(email="privada@example.com", password="x-segura-123", first_name="Pia", last_name="Vela")
        SailorProfile.objects.filter(user=cls.private).update(is_public=False)
        cls.boat = Boat.objects.create(owner=cls.me, name="Brisa")

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.me)

    def lookup(self, email):
        return self.client.get("/api/profiles/lookup/", {"email": email})

    def test_finds_exact_person_and_shows_only_name(self):
        response = self.lookup("  ANA.PEREZ@otro.com ")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["user_id"], self.ana_twin.id)
        self.assertEqual((response.data["first_name"], response.data["last_name"]), ("Ana", "Pérez"))
        self.assertEqual(set(response.data), {"user_id", "first_name", "last_name", "avatar"})  # nunca el email

    def test_not_found_invalid_and_self(self):
        self.assertEqual(self.lookup("nadie@example.com").status_code, 404)
        self.assertEqual(self.lookup("ana").status_code, 400)
        self.assertEqual(self.lookup("yo@example.com").status_code, 400)

    def test_private_profile_can_be_found_by_email(self):
        self.assertEqual(self.lookup("privada@example.com").data["user_id"], self.private.id)

    def test_requires_login_and_is_rate_limited(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.lookup("ana@example.com").status_code, 401)
        self.client.force_authenticate(self.me)
        for _ in range(20):
            self.lookup("x@example.com")
        self.assertEqual(self.lookup("ana@example.com").status_code, 429)

    def test_add_found_sailor_to_crew(self):
        user_id = self.lookup("ana@example.com").data["user_id"]
        response = self.client.post(f"/api/boats/{self.boat.id}/crew/", {"user_id": user_id, "role": "trimmer"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["display_name"], "Ana Pérez")
        self.assertEqual(response.data["user_id"], self.ana.id)

    def test_cannot_add_same_sailor_twice_or_owner(self):
        self.client.post(f"/api/boats/{self.boat.id}/crew/", {"user_id": self.ana.id}, format="json")
        again = self.client.post(f"/api/boats/{self.boat.id}/crew/", {"user_id": self.ana.id}, format="json")
        self.assertEqual(again.status_code, 400)
        self.assertIn("user_id", again.data)
        owner = self.client.post(f"/api/boats/{self.boat.id}/crew/", {"user_id": self.me.id}, format="json")
        self.assertEqual(owner.status_code, 400)

    def test_name_only_still_works(self):
        response = self.client.post(f"/api/boats/{self.boat.id}/crew/", {"name": "Pedro Rojas"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertFalse(CrewMember.objects.filter(user__isnull=False).exists())


class ResultDetailTests(APITestCase):
    """G: abrir un resultado desde el historial de la embarcación."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(email="o@example.com", password="x-segura-123", first_name="Olga")
        cls.other = User.objects.create_user(email="x@example.com", password="x-segura-123")
        cls.boat = Boat.objects.create(owner=cls.owner, name="Brisa", sail_number="CHI 1")
        cls.result = RaceResult.objects.create(
            profile=SailorProfile.objects.get(user=cls.owner), event_name="Nacional", date="2025-02-01", position=1, boat=cls.boat
        )

    def test_anyone_sees_public_result_with_boat(self):
        response = self.client.get(f"/api/profiles/results/{self.result.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sailor"]["name"], "Olga")
        self.assertEqual(response.data["boat_detail"]["sail_number"], "CHI 1")
        self.assertFalse(response.data["is_mine"])

    def test_private_boat_is_not_linked(self):
        Boat.objects.filter(pk=self.boat.pk).update(is_public=False)
        self.client.force_authenticate(self.other)
        self.assertIsNone(self.client.get(f"/api/profiles/results/{self.result.id}/").data["boat_detail"])

    def test_private_profile_result_only_for_owner(self):
        SailorProfile.objects.filter(user=self.owner).update(is_public=False)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/profiles/results/{self.result.id}/").status_code, 404)
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/api/profiles/results/{self.result.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_mine"])


class ProfileGeoTests(APITestCase):
    """H: país, región y club en el perfil."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.user = User.objects.create_user(email="geo@example.com", password="x-segura-123")

    def setUp(self):
        self.client.force_authenticate(self.user)

    def test_regions_by_country(self):
        response = self.client.get("/api/regions/", {"country": "cl"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(r["country"] == "CL" for r in response.data))
        self.assertTrue(response.data)

    def test_set_country_then_region(self):
        self.client.patch("/api/auth/me/", {"country": "CL", "first_name": "Rodri"}, format="json")
        region = Region.objects.filter(country__iso_code="CL").first()
        response = self.client.patch("/api/profiles/me/", {"region_id": region.id}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["region"]["id"], region.id)
        self.assertEqual(response.data["country"], "CL")

    def test_region_must_match_country(self):
        self.client.patch("/api/auth/me/", {"country": "ES"}, format="json")
        chilean = Region.objects.filter(country__iso_code="CL").first()
        response = self.client.patch("/api/profiles/me/", {"region_id": chilean.id}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("region_id", response.data)


class AdminAccessTests(TestCase):
    """I: el panel exige email verificado, además de ser staff."""

    def test_staff_without_verified_email_cannot_log_in(self):
        User.objects.create_user(email="staff@msail.com", password="x-segura-123", is_staff=True)
        response = self.client.post(reverse("admin:login"), {"username": "staff@msail.com", "password": "x-segura-123"})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "email verificado")
        self.assertEqual(self.client.get(reverse("admin:index")).status_code, 302)

    def test_session_is_cut_if_verification_is_lost(self):
        staff = User.objects.create_user(email="s@msail.com", password="x-segura-123", is_staff=True, email_verified=True)
        self.client.force_login(staff)
        self.assertEqual(self.client.get(reverse("admin:index")).status_code, 200)
        User.objects.filter(pk=staff.pk).update(email_verified=False)
        self.assertEqual(self.client.get(reverse("admin:index")).status_code, 302)

    def test_createsuperuser_is_verified_and_enters(self):
        root = User.objects.create_superuser(email="root@msail.com", password="x-segura-123")
        self.assertTrue(root.email_verified)
        response = self.client.post(reverse("admin:login"), {"username": "root@msail.com", "password": "x-segura-123"})
        self.assertEqual(response.status_code, 302)

    def test_user_add_form_loads(self):
        self.client.force_login(User.objects.create_superuser(email="r@msail.com", password="x-segura-123"))
        self.assertEqual(self.client.get(reverse("admin:accounts_user_add")).status_code, 200)


class LocalEmailTests(APITestCase):
    """1 y 3: en los tests el email queda en la bandeja simulada (en local se imprime el código)."""

    def test_register_sends_one_email(self):
        cache.clear()
        self.client.post(
            "/api/auth/register/",
            {"email": "n@example.com", "password": "vela-segura-123", "first_name": "N", "last_name": "M"},
            format="json",
        )
        self.assertEqual(len(mail.outbox), 1)
