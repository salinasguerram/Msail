from datetime import date, timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase

from apps.geo.models import Country
from apps.sailing.models import Club

from .models import RaceResult, SailorProfile

User = get_user_model()


class ProfileTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.user = User.objects.create_user(email="ana@example.com", password="vela-segura-123", first_name="Ana")
        cls.other = User.objects.create_user(email="leo@example.com", password="vela-segura-123", first_name="Leo")
        cls.club = Club.objects.create(name="Club Náutico Test", slug="cn-test", country=Country.objects.get(iso_code="CL"))

    def setUp(self):
        self.client.force_authenticate(self.user)


class SailorProfileTests(ProfileTestCase):
    def test_profile_is_created_with_user(self):
        self.assertTrue(SailorProfile.objects.filter(user=self.user).exists())

    def test_get_my_profile(self):
        response = self.client.get("/api/profiles/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["first_name"], "Ana")
        self.assertEqual(response.data["stats"]["regattas"], 0)

    def test_update_profile(self):
        response = self.client.patch(
            "/api/profiles/me/",
            {
                "bio": "Regatista de J/70",
                "experience_level": "advanced",
                "sailing_since": 2010,
                "roles": ["helmsman", "tactician", "helmsman"],
                "boat_classes": ["j70", "optimist"],
                "home_club_id": self.club.id,
                "available_as_crew": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["roles"], ["helmsman", "tactician"])
        self.assertCountEqual(response.data["boat_classes"], ["j70", "optimist"])
        self.assertEqual(response.data["home_club"]["name"], "Club Náutico Test")

    def test_rejects_invalid_role_and_class(self):
        response = self.client.patch("/api/profiles/me/", {"roles": ["capitan-pirata"]}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.patch("/api/profiles/me/", {"boat_classes": ["no-existe"]}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_rejects_future_sailing_since(self):
        response = self.client.patch("/api/profiles/me/", {"sailing_since": date.today().year + 1}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("sailing_since", response.data)

    def test_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/profiles/me/").status_code, 401)


class PublicProfileTests(ProfileTestCase):
    def test_public_profile_visible_to_anyone(self):
        self.client.force_authenticate(None)
        response = self.client.get(f"/api/profiles/{self.other.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("is_public", response.data)
        self.assertNotIn("email", response.data)

    def test_private_profile_hidden_from_others(self):
        SailorProfile.objects.filter(user=self.other).update(is_public=False)
        self.assertEqual(self.client.get(f"/api/profiles/{self.other.id}/").status_code, 404)

    def test_owner_sees_own_private_profile(self):
        SailorProfile.objects.filter(user=self.user).update(is_public=False)
        self.assertEqual(self.client.get(f"/api/profiles/{self.user.id}/").status_code, 200)


class RaceResultTests(ProfileTestCase):
    def result(self, **overrides):
        data = {
            "event_name": "Campeonato Nacional J/70",
            "date": "2025-03-10",
            "location": "Algarrobo",
            "boat_class": "j70",
            "role": "helmsman",
            "position": 2,
            "fleet_size": 24,
        }
        data.update(overrides)
        return data

    def test_create_and_list_results_with_stats(self):
        self.client.post("/api/profiles/me/results/", self.result(), format="json")
        self.client.post("/api/profiles/me/results/", self.result(position=1, date="2025-05-01"), format="json")
        self.client.post("/api/profiles/me/results/", self.result(position=9, date="2024-01-01"), format="json")

        listing = self.client.get("/api/profiles/me/results/")
        self.assertEqual(len(listing.data), 3)
        self.assertEqual(listing.data[0]["date"], "2025-05-01")  # más reciente primero

        stats = self.client.get("/api/profiles/me/").data["stats"]
        self.assertEqual(stats, {"regattas": 3, "podiums": 2, "wins": 1, "best_position": 1})

    def test_position_cannot_exceed_fleet(self):
        response = self.client.post("/api/profiles/me/results/", self.result(position=30, fleet_size=24), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("position", response.data)

    def test_rejects_future_date(self):
        future = (date.today() + timedelta(days=3)).isoformat()
        response = self.client.post("/api/profiles/me/results/", self.result(date=future), format="json")
        self.assertEqual(response.status_code, 400)

    def test_partial_update_keeps_validation(self):
        created = self.client.post("/api/profiles/me/results/", self.result(), format="json").data
        response = self.client.patch(f"/api/profiles/me/results/{created['id']}/", {"position": 50}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(f"/api/profiles/me/results/{created['id']}/", {"position": 3}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_cannot_touch_other_users_results(self):
        other_profile = SailorProfile.objects.get(user=self.other)
        foreign = RaceResult.objects.create(profile=other_profile, event_name="X", date="2024-01-01", position=1)
        self.assertEqual(self.client.get(f"/api/profiles/me/results/{foreign.id}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/profiles/me/results/{foreign.id}/").status_code, 404)
        self.assertTrue(RaceResult.objects.filter(pk=foreign.pk).exists())

    def test_delete_result(self):
        created = self.client.post("/api/profiles/me/results/", self.result(), format="json").data
        self.assertEqual(self.client.delete(f"/api/profiles/me/results/{created['id']}/").status_code, 204)


class CatalogTests(ProfileTestCase):
    def test_catalogs_are_public(self):
        self.client.force_authenticate(None)
        classes = self.client.get("/api/boat-classes/")
        self.assertEqual(classes.status_code, 200)
        self.assertIn("j70", [c["slug"] for c in classes.data])
        countries = self.client.get("/api/countries/", HTTP_ACCEPT_LANGUAGE="en")
        self.assertIn("Spain", [c["name"] for c in countries.data])

    def test_club_search(self):
        response = self.client.get("/api/clubs/?search=náutico&country=cl")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(self.client.get("/api/clubs/?country=ES").data["count"], 0)
