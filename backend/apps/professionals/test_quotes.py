from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.boats.models import Boat
from apps.geo.models import Country
from apps.notifications.models import Notification

from .models import Professional, QuoteRequest, QuoteStatus, Review, Specialty

User = get_user_model()


def days(n):
    return (timezone.localdate() + timedelta(days=n)).isoformat()


class Base:
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        es = Country.objects.get(iso_code="ES")
        cls.with_email = Professional.objects.create(name="Velas Test", slug="velas-test", country=es, city="Palma", email="velas@example.com")
        cls.without_email = Professional.objects.create(name="Rigger Test", slug="rigger-test", country=es, city="Palma")
        cls.ana = User.objects.create_user(
            email="ana@example.com", password="vela-segura-123", first_name="Ana", last_name="Soto", email_verified=True
        )
        cls.boat = Boat.objects.create(owner=cls.ana, name="Viento Sur", model="First 36.7", length_m="11.20")

    def quote(self, slug="velas-test", **extra):
        data = {"details": "Necesito un génova nuevo para regata.", "specialty": "sailmaking", "needed_by": days(30)}
        data.update(extra)
        return self.client.post(f"/api/professionals/{slug}/quotes/", data, format="json")


@override_settings(QUOTE_REQUESTS_EMAIL="equipo@msail.test")
class QuoteApiTests(Base, APITestCase):
    def setUp(self):
        self.client.force_authenticate(self.ana)

    def test_needs_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.quote().status_code, 401)

    def test_professional_with_email_receives_it_directly(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.quote(boat=self.boat.pk)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], "sent")
        quote = QuoteRequest.objects.get()
        self.assertEqual(quote.boat_description, "Viento Sur · First 36.7, 11.2 m")
        to_pro = next(m for m in mail.outbox if m.to == ["velas@example.com"])
        self.assertEqual(to_pro.reply_to, ["ana@example.com"])
        self.assertIn("génova", to_pro.body)
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), ["ana@example.com", "equipo@msail.test", "velas@example.com"])

    def test_professional_without_email_stays_pending_for_the_team(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.quote(slug="rigger-test", specialty="rigging")
        self.assertEqual(response.data["status"], "pending")
        team = next(m for m in mail.outbox if m.to == ["equipo@msail.test"])
        self.assertIn("hay que reenviarlo", team.body)

    def test_validation(self):
        self.assertIn("details", self.quote(details="corto").data)
        self.assertIn("needed_by", self.quote(needed_by=days(-2)).data)
        other = Boat.objects.create(owner=User.objects.create_user(email="leo@example.com", password="x-segura-123"), name="Ajeno")
        self.assertIn("boat", self.quote(boat=other.pk).data)
        self.assertFalse(QuoteRequest.objects.exists())

    def test_my_quotes_and_cancel(self):
        created = self.quote().data
        mine = self.client.get("/api/professionals/quotes/").data
        self.assertEqual(mine["results"][0]["professional"]["name"], "Velas Test")
        self.assertEqual(mine["results"][0]["specialty"], "Velería")
        cancelled = self.client.post(f"/api/professionals/quotes/{created['id']}/cancel/").data
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertEqual(self.client.post(f"/api/professionals/quotes/{created['id']}/cancel/").status_code, 400)


class ReviewApiTests(Base, APITestCase):
    url = "/api/professionals/velas-test/reviews/"

    def test_create_update_and_average(self):
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.client.post(self.url, {"rating": 4, "comment": "Muy buen trabajo"}, format="json").status_code, 201)
        response = self.client.post(self.url, {"rating": 5, "comment": "Excelente"}, format="json")
        self.assertEqual(response.status_code, 200)  # la segunda vez actualiza
        self.assertEqual(Review.objects.count(), 1)
        leo = User.objects.create_user(email="leo@example.com", password="x-segura-123", email_verified=True)
        self.client.force_authenticate(leo)
        self.client.post(self.url, {"rating": 2}, format="json")

        row = next(p for p in self.client.get("/api/professionals/").data["results"] if p["slug"] == "velas-test")
        self.assertEqual((row["rating"], row["reviews_count"]), (3.5, 2))
        detail = self.client.get("/api/professionals/velas-test/").data
        self.assertEqual(detail["my_review"]["rating"], 2)
        authors = [r["author"] for r in detail["latest_reviews"]]
        self.assertIn("Ana S.", authors)  # nombre e inicial del apellido

    def test_rules(self):
        self.assertEqual(self.client.post(self.url, {"rating": 5}, format="json").status_code, 401)
        unverified = User.objects.create_user(email="sin@example.com", password="x-segura-123")
        self.client.force_authenticate(unverified)
        self.assertEqual(self.client.post(self.url, {"rating": 5}, format="json").status_code, 403)
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.client.post(self.url, {"rating": 6}, format="json").status_code, 400)
        self.assertEqual(self.client.post(self.url, {"comment": "sin puntaje"}, format="json").status_code, 400)

    def test_client_badge_hidden_reviews_and_delete(self):
        self.client.force_authenticate(self.ana)
        self.quote()
        self.client.post(self.url, {"rating": 5}, format="json")
        self.assertTrue(self.client.get(self.url).data["results"][0]["is_client"])
        Review.objects.update(is_visible=False)
        self.assertEqual(self.client.get(self.url).data["count"], 0)
        self.assertIsNone(self.client.get("/api/professionals/velas-test/").data["rating"])
        self.assertEqual(self.client.delete("/api/professionals/velas-test/reviews/mine/").status_code, 204)
        self.assertFalse(Review.objects.exists())

    def test_order_by_rating(self):
        Review.objects.create(professional=self.without_email, user=self.ana, rating=5)
        slugs = [p["slug"] for p in self.client.get("/api/professionals/?order=rating").data["results"]]
        self.assertEqual(slugs[0], "rigger-test")


class PanelTests(Base, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.admin = User.objects.create_superuser(email="admin@msail.com", password="x-segura-123")

    def setUp(self):
        self.client.force_login(self.admin)
        self.quote_obj = QuoteRequest.objects.create(
            professional=self.without_email, user=self.ana, details="Revisión de jarcia completa",
            contact_name="Ana Soto", contact_email="ana@example.com", specialty=Specialty.objects.get(slug="rigging"),
        )

    def test_answer_notifies_sailor(self):
        url = reverse("admin:professionals_quoterequest_change", args=[self.quote_obj.pk])
        self.assertContains(self.client.get(url), "Sin datos de contacto cargados.")
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(url, {"status": QuoteStatus.ANSWERED, "response": "Son 450 € con materiales.", "staff_notes": ""})
        self.quote_obj.refresh_from_db()
        self.assertEqual(self.quote_obj.status, QuoteStatus.ANSWERED)
        notification = Notification.objects.get(user=self.ana)
        self.assertEqual((notification.kind, notification.body), ("quote", "Son 450 € con materiales."))
        self.assertEqual(mail.outbox[0].to, ["ana@example.com"])

    def test_badge_and_review_moderation(self):
        self.assertContains(self.client.get(reverse("admin:index")), "Pedidos de presupuesto")
        review = Review.objects.create(professional=self.with_email, user=self.ana, rating=1, comment="Spam")
        self.client.post(reverse("admin:professionals_review_changelist"), {"action": "hide", "_selected_action": [str(review.pk)]})
        review.refresh_from_db()
        self.assertFalse(review.is_visible)
        self.assertEqual(self.client.get(reverse("admin:professionals_quoterequest_add")).status_code, 403)
