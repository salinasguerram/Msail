from datetime import date
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase

from apps.profiles.models import SailorProfile

from .models import Boat, CrewMember

User = get_user_model()


class BoatTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.owner = User.objects.create_user(email="owner@example.com", password="x-segura-123", first_name="Olga")
        cls.crew_user = User.objects.create_user(email="crew@example.com", password="x-segura-123", first_name="Cris")
        cls.stranger = User.objects.create_user(email="otro@example.com", password="x-segura-123")

    def setUp(self):
        self.client.force_authenticate(self.owner)

    def create_boat(self, **overrides):
        data = {
            "name": "Viento Sur",
            "boat_class": "j70",
            "sail_number": "CHI 1234",
            "model": "J/70",
            "builder": "J/Boats",
            "year_built": 2018,
            "length_m": "6.93",
            "beam_m": "2.25",
            "draft_m": "1.45",
            "displacement_kg": 794,
            "home_port": "Algarrobo",
            "country": "CL",
        }
        data.update(overrides)
        return self.client.post("/api/boats/mine/", data, format="json")


class BoatCrudTests(BoatTestCase):
    def test_create_and_get_boat(self):
        response = self.create_boat()
        self.assertEqual(response.status_code, 201, response.data)
        detail = self.client.get(f"/api/boats/{response.data['id']}/")
        self.assertEqual(detail.data["name"], "Viento Sur")
        self.assertEqual(detail.data["length_m"], "6.93")
        self.assertEqual(detail.data["country"], "CL")
        self.assertTrue(detail.data["is_owner"])
        self.assertEqual(detail.data["owner"]["name"], "Olga")

    def test_rejects_invalid_measures_and_year(self):
        self.assertEqual(self.create_boat(length_m="-3").status_code, 400)
        response = self.create_boat(year_built=date.today().year + 5)
        self.assertEqual(response.status_code, 400)
        self.assertIn("year_built", response.data)

    def test_only_owner_can_edit_or_delete(self):
        boat_id = self.create_boat().data["id"]
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.patch(f"/api/boats/{boat_id}/", {"name": "Mío"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/boats/{boat_id}/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/boats/{boat_id}/").data["is_owner"], False)

        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.patch(f"/api/boats/{boat_id}/", {"rating": "ORC 585"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/boats/{boat_id}/").status_code, 204)

    def test_private_boat_hidden_except_owner_and_crew(self):
        boat_id = self.create_boat(is_public=False).data["id"]
        CrewMember.objects.create(boat_id=boat_id, user=self.crew_user, role="trimmer")

        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(f"/api/boats/{boat_id}/").status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/boats/{boat_id}/").status_code, 404)
        self.client.force_authenticate(self.crew_user)
        self.assertEqual(self.client.get(f"/api/boats/{boat_id}/").status_code, 200)

    def test_public_boat_visible_anonymously(self):
        boat_id = self.create_boat().data["id"]
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/boats/{boat_id}/").status_code, 200)

    def test_my_boats_includes_boats_where_i_crew(self):
        boat_id = self.create_boat().data["id"]
        CrewMember.objects.create(boat_id=boat_id, user=self.crew_user)
        self.client.force_authenticate(self.crew_user)
        self.assertEqual([b["id"] for b in self.client.get("/api/boats/mine/").data], [boat_id])
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get("/api/boats/mine/").data, [])


class CrewTests(BoatTestCase):
    def test_owner_manages_crew(self):
        boat_id = self.create_boat().data["id"]
        added = self.client.post(f"/api/boats/{boat_id}/crew/", {"name": "Pedro Rojas", "role": "bowman"}, format="json")
        self.assertEqual(added.status_code, 201, added.data)
        self.assertEqual(added.data["display_name"], "Pedro Rojas")

        member = f"/api/boats/{boat_id}/crew/{added.data['id']}/"
        self.assertEqual(self.client.patch(member, {"is_active": False}, format="json").data["is_active"], False)
        crew = self.client.get(f"/api/boats/{boat_id}/").data["crew"]
        self.assertEqual(len(crew), 1)
        self.assertEqual(self.client.delete(member).status_code, 204)

    def test_crew_requires_name(self):
        boat_id = self.create_boat().data["id"]
        response = self.client.post(f"/api/boats/{boat_id}/crew/", {"name": "  ", "role": "crew"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_stranger_cannot_add_or_edit_crew(self):
        boat_id = self.create_boat().data["id"]
        member = CrewMember.objects.create(boat_id=boat_id, name="Ana")
        self.client.force_authenticate(self.stranger)
        response = self.client.post(f"/api/boats/{boat_id}/crew/", {"name": "Intruso"}, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.client.patch(f"/api/boats/{boat_id}/crew/{member.id}/", {"name": "X"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(CrewMember.objects.get(pk=member.pk).name, "Ana")

    def test_linked_user_shows_full_name(self):
        boat = Boat.objects.get(pk=self.create_boat().data["id"])
        CrewMember.objects.create(boat=boat, user=self.crew_user, role="trimmer")
        crew = self.client.get(f"/api/boats/{boat.id}/").data["crew"]
        self.assertEqual(crew[0]["display_name"], "Cris")
        self.assertEqual(crew[0]["user_id"], self.crew_user.id)


class BoatHistoryTests(BoatTestCase):
    def result(self, boat_id, **overrides):
        data = {"event_name": "Nacional J/70", "date": "2025-03-10", "position": 2, "fleet_size": 20, "boat": boat_id}
        data.update(overrides)
        return self.client.post("/api/profiles/me/results/", data, format="json")

    def test_result_linked_to_boat_appears_in_history(self):
        boat_id = self.create_boat().data["id"]
        response = self.result(boat_id)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["boat_name"], "Viento Sur")  # se completa desde el barco
        self.assertEqual(response.data["boat_class"], "j70")

        boat = self.client.get(f"/api/boats/{boat_id}/").data
        self.assertEqual(len(boat["history"]), 1)
        self.assertEqual(boat["history"][0]["sailor"]["name"], "Olga")
        self.assertEqual(boat["stats"]["podiums"], 1)

    def test_crew_can_log_results_on_the_boat(self):
        boat_id = self.create_boat().data["id"]
        CrewMember.objects.create(boat_id=boat_id, user=self.crew_user)
        self.client.force_authenticate(self.crew_user)
        self.assertEqual(self.result(boat_id, position=1).status_code, 201)

    def test_cannot_link_result_to_someone_elses_boat(self):
        boat_id = self.create_boat().data["id"]
        self.client.force_authenticate(self.stranger)
        response = self.result(boat_id)
        self.assertEqual(response.status_code, 400)
        self.assertIn("boat", response.data)

    def test_history_hides_results_from_private_profiles(self):
        boat_id = self.create_boat().data["id"]
        self.result(boat_id)
        SailorProfile.objects.filter(user=self.owner).update(is_public=False)
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(f"/api/boats/{boat_id}/").data["history"], [])
