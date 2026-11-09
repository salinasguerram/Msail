from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.roles import MODERATORS
from apps.boats.models import Boat
from apps.geo.models import Country
from apps.notifications.models import Notification

from .models import BerthRequest, Marina, MarinaRate, RequestStatus

User = get_user_model()


def days(n):
    return (timezone.localdate() + timedelta(days=n)).isoformat()


class Base:
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.marina = Marina.objects.create(
            name="Marina Test", slug="marina-test", country=Country.objects.get(iso_code="ES"), city="Palma",
            max_length_m=20, max_draft_m=3,
        )
        cls.ana = User.objects.create_user(
            email="ana@example.com", password="vela-segura-123", first_name="Ana", last_name="Soto", email_verified=True
        )
        cls.boat = Boat.objects.create(owner=cls.ana, name="Viento Sur", length_m="11.20", beam_m="3.80", draft_m="2.10")

    def payload(self, **extra):
        data = {"boat_type": "sailboat", "boat_name": "Gaviota", "length_m": "10", "arrival": days(10), "departure": days(13)}
        data.update(extra)
        return data


@override_settings(MARINA_REQUESTS_EMAIL="equipo@msail.test")
class RequestApiTests(Base, APITestCase):
    url = "/api/marinas/marina-test/requests/"

    def setUp(self):
        self.client.force_authenticate(self.ana)

    def test_needs_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.url, self.payload(), format="json").status_code, 401)

    def test_create_with_my_boat_fills_data_and_sends_emails(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url, {"boat": self.boat.pk, "boat_type": "sailboat", "arrival": days(5), "departure": days(8)}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        request = BerthRequest.objects.get()
        self.assertEqual((request.boat_name, str(request.length_m), str(request.draft_m)), ("Viento Sur", "11.20", "2.10"))
        self.assertEqual((request.contact_name, request.contact_email), ("Ana Soto", "ana@example.com"))
        self.assertEqual(response.data["nights"], 3)
        self.assertEqual(response.data["status"], "pending")
        recipients = sorted(m.to[0] for m in mail.outbox)
        self.assertEqual(recipients, ["ana@example.com", "equipo@msail.test"])
        team = next(m for m in mail.outbox if m.to == ["equipo@msail.test"])
        self.assertEqual(team.reply_to, ["ana@example.com"])
        self.assertIn("Viento Sur", team.body)

    def test_validation(self):
        cases = [
            (self.payload(arrival=days(-1)), "arrival"),
            (self.payload(departure=days(10)), "departure"),  # misma fecha que la llegada
            (self.payload(departure=days(400)), "departure"),
            (self.payload(length_m="25"), "length_m"),  # la marina recibe hasta 20 m
            (self.payload(draft_m="3.5"), "draft_m"),
            (self.payload(boat_name=""), "boat_name"),
            (self.payload(length_m=None), "length_m"),
        ]
        for data, field in cases:
            response = self.client.post(self.url, data, format="json")
            self.assertEqual(response.status_code, 400, (field, response.data))
            self.assertIn(field, response.data)
        other = Boat.objects.create(owner=User.objects.create_user(email="leo@example.com", password="x-segura-123"), name="Ajeno")
        self.assertIn("boat", self.client.post(self.url, self.payload(boat=other.pk), format="json").data)
        self.assertFalse(BerthRequest.objects.exists())

    def test_my_requests_and_cancel(self):
        created = self.client.post(self.url, self.payload(), format="json").data
        mine = self.client.get("/api/marinas/requests/").data
        self.assertEqual(mine["count"], 1)
        self.assertEqual(mine["results"][0]["marina"]["name"], "Marina Test")
        self.assertTrue(mine["results"][0]["can_cancel"])
        response = self.client.post(f"/api/marinas/requests/{created['id']}/cancel/")
        self.assertEqual(response.data["status"], "cancelled")
        self.assertFalse(response.data["can_cancel"])
        self.assertEqual(self.client.post(f"/api/marinas/requests/{created['id']}/cancel/").status_code, 400)

    def test_cannot_see_or_cancel_others(self):
        leo = User.objects.create_user(email="leo@example.com", password="x-segura-123")
        foreign = BerthRequest.objects.create(
            marina=self.marina, user=leo, boat_name="X", length_m=8, arrival=days(3), departure=days(4),
            contact_name="Leo", contact_email="leo@example.com",
        )
        self.assertEqual(self.client.get("/api/marinas/requests/").data["count"], 0)
        self.assertEqual(self.client.post(f"/api/marinas/requests/{foreign.pk}/cancel/").status_code, 404)


class PanelTests(Base, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.admin = User.objects.create_superuser(email="admin@msail.com", password="x-segura-123")
        MarinaRate.objects.create(marina=cls.marina, label="Temporada alta", amount="5", currency="EUR", unit="meter_night")

    def setUp(self):
        self.client.force_login(self.admin)
        self.request = BerthRequest.objects.create(
            marina=self.marina, user=self.ana, boat_name="Gaviota", length_m=10, arrival=days(10), departure=days(13),
            contact_name="Ana Soto", contact_email="ana@example.com", contact_phone="+54 9 11 1234 5678",
        )
        self.change_url = reverse("admin:marinas_berthrequest_change", args=[self.request.pk])

    def test_change_page_shows_estimate_contact_and_badge(self):
        response = self.client.get(self.change_url)
        self.assertContains(response, "<b>150.00 EUR</b>", html=False)  # 5 € × 10 m × 3 noches
        self.assertContains(response, "https://wa.me/5491112345678")
        changelist = self.client.get(reverse("admin:marinas_berthrequest_changelist"))
        self.assertContains(changelist, "Gaviota")
        self.assertContains(self.client.get(reverse("admin:index")), "Solicitudes de amarre")

    def test_answer_from_change_form_notifies_sailor(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                self.change_url,
                {"status": RequestStatus.ACCEPTED, "response": "Te esperamos en el pantalán B.", "staff_notes": "Confirmado por teléfono"},
                follow=True,
            )
        self.request.refresh_from_db()
        self.assertEqual(self.request.status, RequestStatus.ACCEPTED)
        self.assertIsNotNone(self.request.responded_at)
        notification = Notification.objects.get(user=self.ana)
        self.assertEqual(notification.kind, "berth")
        self.assertEqual(notification.body, "Te esperamos en el pantalán B.")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("pantalán B", mail.outbox[0].body)

    def test_bulk_reject_only_pending(self):
        self.client.post(
            reverse("admin:marinas_berthrequest_changelist"), {"action": "reject", "_selected_action": [str(self.request.pk)]}
        )
        self.client.post(
            reverse("admin:marinas_berthrequest_changelist"), {"action": "accept", "_selected_action": [str(self.request.pk)]}
        )
        self.request.refresh_from_db()
        self.assertEqual(self.request.status, RequestStatus.REJECTED)  # ya no estaba pendiente: no se acepta
        self.assertEqual(Notification.objects.filter(user=self.ana).count(), 1)

    def test_requests_cannot_be_created_from_panel(self):
        self.assertEqual(self.client.get(reverse("admin:marinas_berthrequest_add")).status_code, 403)

    def test_marina_list_counts_and_actions(self):
        response = self.client.get(reverse("admin:marinas_marina_changelist"))
        self.assertContains(response, "Pendientes")
        self.client.post(reverse("admin:marinas_marina_changelist"), {"action": "mark_verified", "_selected_action": [str(self.marina.pk)]})
        self.marina.refresh_from_db()
        self.assertTrue(self.marina.verified)

    def test_moderator_can_answer_but_not_delete(self):
        call_command("setup_roles", stdout=StringIO())
        moderator = User.objects.create_user(email="mod@msail.com", password="x-segura-123", is_staff=True, email_verified=True)
        moderator.groups.add(Group.objects.get(name=MODERATORS))
        self.client.force_login(moderator)
        self.assertEqual(self.client.get(self.change_url).status_code, 200)
        self.assertEqual(self.client.get(reverse("admin:marinas_berthrequest_delete", args=[self.request.pk])).status_code, 403)
