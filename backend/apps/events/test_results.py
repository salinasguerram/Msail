from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.roles import MODERATORS
from apps.boats.models import Boat
from apps.geo.models import Country
from apps.profiles.models import RaceResult, SailorProfile

from .models import Event, EventCategory, EventResult, EventType, ResultStatus
from .results_import import ResultsImportError, import_results, parse_csv

User = get_user_model()


def days(n):
    return timezone.localdate() + timedelta(days=n)


class ResultsBase:
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.es = Country.objects.get(iso_code="ES")
        cls.event = Event.objects.create(
            name="Copa Test", slug="copa-test", event_type=EventType.INSHORE,
            start_date=days(-10), end_date=days(-8), country=cls.es, city="Palma",
        )
        cls.orc = EventCategory.objects.create(event=cls.event, name="ORC A", order=0)
        cls.j70 = EventCategory.objects.create(event=cls.event, name="J/70", order=1)


class CsvParseTests(ResultsBase, TestCase):
    def test_spanish_headers_semicolon_and_status_codes(self):
        raw = (
            "Puesto;Barco;Vela;Timonel;País;Puntos;Categoría\n"
            "1º;Nola;EST 1;Margus Uudam;es;3,0;orc a\n"
            "2;Vudu;ESP 7;;ES;8;ORC A\n"
            "DNF;Niramo;;;;;ORC A\n"
            "\n"
        ).encode("utf-8")
        rows, errors = parse_csv(raw)
        self.assertEqual(errors, [])
        self.assertEqual([r["position"] for r in rows], [1, 2, None])
        self.assertEqual(rows[0]["country"], "ES")
        self.assertEqual(str(rows[0]["points"]), "3.0")
        self.assertEqual(rows[2]["status"], ResultStatus.DNF)

    def test_english_headers_with_comma_and_excel_encoding(self):
        raw = "Rank,Yacht,Sail No,Helm,Nat,Nett,Status\n1,Señorita,ESP 9,José,ES,4,\n,Black Jack,,,,,RTD\n".encode("cp1252")
        rows, errors = parse_csv(raw)
        self.assertEqual(errors, [])
        self.assertEqual(rows[0]["boat_name"], "Señorita")
        self.assertEqual(rows[1]["status"], ResultStatus.RET)

    def test_reports_bad_rows(self):
        raw = b"puesto;barco;puntos;estado\nuno;A;;\n2;;;\n3;C;abc;\n;D;;\n5;E;;XYZ\n6;F;2;\n"
        rows, errors = parse_csv(raw)
        self.assertEqual([r["boat_name"] for r in rows], ["F"])
        self.assertEqual(len(errors), 5)
        self.assertIn("Fila 2", errors[0])

    def test_rejects_file_without_boat_column(self):
        with self.assertRaises(ResultsImportError):
            parse_csv(b"puesto;puntos\n1;3\n")
        with self.assertRaises(ResultsImportError):
            parse_csv(b"")


class ImportTests(ResultsBase, TestCase):
    def rows(self, text):
        rows, errors = parse_csv(text.encode())
        self.assertEqual(errors, [])
        return rows

    def test_matches_categories_creates_missing_and_replaces(self):
        EventResult.objects.create(event=self.event, category=self.orc, position=1, boat_name="Viejo")
        EventResult.objects.create(event=self.event, category=self.j70, position=1, boat_name="Se queda")
        count, created = import_results(self.event, self.rows("puesto;barco;categoria\n1;Nola;ORC a\n1;Pez;Doble mano\n"))
        self.assertEqual(count, 2)
        self.assertEqual(created, ["Doble mano"])
        names = set(self.event.results.values_list("boat_name", flat=True))
        self.assertEqual(names, {"Nola", "Pez", "Se queda"})  # se reemplazó solo ORC A

    def test_default_category_and_append(self):
        import_results(self.event, self.rows("puesto;barco\n1;A\n"), default_category=self.j70)
        import_results(self.event, self.rows("puesto;barco\n2;B\n"), default_category=self.j70, replace=False)
        self.assertEqual(self.j70.results.count(), 2)

    def test_model_validation(self):
        with self.assertRaises(ValidationError):
            EventResult(event=self.event, boat_name="Sin puesto").clean()
        other = Event.objects.create(name="Otra", slug="otra", event_type=EventType.INSHORE, start_date=days(1), country=self.es)
        with self.assertRaises(ValidationError):
            EventResult(event=other, category=self.orc, position=1, boat_name="X").clean()
        EventResult(event=self.event, status=ResultStatus.DNS, boat_name="No largó").clean()


class ResultsApiTests(ResultsBase, APITestCase):
    def test_detail_groups_results_general_first_and_dnf_last(self):
        owner = User.objects.create_user(email="dueno@example.com", password="vela-segura-123")
        public_boat = Boat.objects.create(owner=owner, name="Nola", is_public=True)
        private_boat = Boat.objects.create(owner=owner, name="Vudu", is_public=False)
        EventResult.objects.create(event=self.event, category=self.orc, status=ResultStatus.DNF, boat_name="Niramo")
        EventResult.objects.create(event=self.event, category=self.orc, position=2, boat_name="Vudu", boat=private_boat)
        EventResult.objects.create(event=self.event, category=self.orc, position=1, boat_name="Nola", boat=public_boat, points=3)
        EventResult.objects.create(event=self.event, position=1, boat_name="Line honours")
        Event.objects.filter(pk=self.event.pk).update(results_url="https://club.org/resultados", results_partial=True)

        data = self.client.get(f"/api/events/{self.event.slug}/").data
        self.assertEqual([g["category"] for g in data["results"]], [None, "ORC A"])
        orc = data["results"][1]["results"]
        self.assertEqual([r["boat_name"] for r in orc], ["Nola", "Vudu", "Niramo"])
        self.assertEqual(orc[0]["boat"], public_boat.id)
        self.assertIsNone(orc[1]["boat"])  # barco privado: no se enlaza
        self.assertEqual(orc[0]["points"], 3.0)
        self.assertEqual(data["results_url"], "https://club.org/resultados")
        self.assertTrue(data["results_partial"])

    def test_event_without_results(self):
        data = self.client.get(f"/api/events/{self.event.slug}/").data
        self.assertEqual(data["results"], [])
        self.assertFalse(data["results_partial"])


class SailorResultLinkTests(ResultsBase, APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="ana@example.com", password="vela-segura-123", first_name="Ana", last_name="Soto")
        SailorProfile.objects.filter(user=self.user).update(is_public=True)
        self.client.force_authenticate(self.user)

    def test_result_linked_to_event_fills_name_date_and_place(self):
        response = self.client.post("/api/profiles/me/results/", {"event": "copa-test", "position": 3, "fleet_size": 20}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["event"], "copa-test")
        self.assertEqual(response.data["event_name"], "Copa Test")
        self.assertEqual(response.data["date"], days(-8).isoformat())
        self.assertEqual(response.data["location"], "Palma, España")

        sailors = self.client.get("/api/events/copa-test/").data["msail_sailors"]
        self.assertEqual(len(sailors), 1)
        self.assertEqual(sailors[0]["name"], "Ana Soto")
        self.assertEqual(sailors[0]["position"], 3)

    def test_private_profiles_are_not_listed_on_the_event(self):
        RaceResult.objects.create(profile=self.user.sailor_profile, event=self.event, event_name="Copa Test", date=days(-8), position=1)
        SailorProfile.objects.filter(user=self.user).update(is_public=False)
        self.assertEqual(self.client.get("/api/events/copa-test/").data["msail_sailors"], [])

    def test_cannot_link_future_event_and_needs_a_name(self):
        Event.objects.create(name="Futura", slug="futura", event_type=EventType.INSHORE, start_date=days(5), country=self.es)
        response = self.client.post("/api/profiles/me/results/", {"event": "futura", "position": 1}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("event", response.data)
        response = self.client.post("/api/profiles/me/results/", {"date": days(-1).isoformat(), "position": 1}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("event_name", response.data)

    def test_text_only_results_still_work(self):
        response = self.client.post(
            "/api/profiles/me/results/", {"event_name": "Regata del club", "date": days(-1).isoformat(), "position": 2}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data["event"])


class ResultsAdminTests(ResultsBase, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.admin = User.objects.create_superuser(email="admin@msail.com", password="x-segura-123")

    def setUp(self):
        self.client.force_login(self.admin)
        self.url = reverse("admin:events_event_import_results_action", args=[self.event.pk])

    def upload(self, text, **extra):
        data = {"file": SimpleUploadedFile("resultados.csv", text.encode(), content_type="text/csv"), "replace": "on"}
        data.update(extra)
        return self.client.post(self.url, data, follow=True)

    def test_change_form_has_import_button_and_page_loads(self):
        change = self.client.get(reverse("admin:events_event_change", args=[self.event.pk]))
        self.assertContains(change, "Importar resultados (CSV)")
        self.assertContains(self.client.get(self.url), "Descargar plantilla CSV")
        template = self.client.get(reverse("admin:events_event_results_template"))
        self.assertEqual(template["Content-Type"], "text/csv; charset=utf-8")
        self.assertIn("puesto;barco", template.content.decode("utf-8-sig"))

    def test_import_from_panel(self):
        response = self.upload("puesto;barco;vela\n1;Nola;EST 1\n2;Vudu;ESP 7\n", category=self.orc.pk)
        self.assertContains(response, "Se importaron 2 resultados")
        self.assertEqual(list(self.orc.results.values_list("boat_name", flat=True)), ["Nola", "Vudu"])

    def test_errors_import_nothing(self):
        response = self.upload("puesto;barco\n1;Nola\nx;Vudu\n")
        self.assertContains(response, "Fila 3")
        self.assertFalse(EventResult.objects.exists())

    def test_moderator_can_import(self):
        call_command("setup_roles", stdout=StringIO())
        moderator = User.objects.create_user(email="mod@msail.com", password="x-segura-123", is_staff=True, email_verified=True)
        moderator.groups.add(Group.objects.get(name=MODERATORS))
        self.client.force_login(moderator)
        response = self.upload("puesto;barco\n1;Nola\n")
        self.assertContains(response, "Se importaron 1 resultados")
