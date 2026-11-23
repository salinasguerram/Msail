from io import StringIO

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.professionals.models import Professional, Review
from apps.profiles.models import SailorProfile

from .models import Block, Report, ReportStatus

User = get_user_model()


def make_user(email, **extra):
    return User.objects.create_user(email=email, password="clave-segura-123", email_verified=True, **extra)


class ModerationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())

    def setUp(self):
        self.ana = make_user("ana@example.com", first_name="Ana")
        self.bob = make_user("bob@example.com", first_name="Bob")
        for user in (self.ana, self.bob):
            profile, _ = SailorProfile.objects.get_or_create(user=user)
            profile.is_public = True
            profile.available_as_crew = True
            profile.save()
        from apps.geo.models import Country

        self.pro = Professional.objects.create(name="Velería", slug="veleria", country=Country.objects.first(), is_published=True)
        self.review = Review.objects.create(professional=self.pro, user=self.bob, rating=1, comment="Malísimo")

    def crew(self):
        return [m["user_id"] for m in self.client.get("/api/profiles/crew/").data["results"]]

    def reviews(self):
        return [r["author_id"] for r in self.client.get(f"/api/professionals/{self.pro.slug}/reviews/").data["results"]]

    @override_settings(MODERATION_EMAIL="equipo@msail.test")
    def test_report_a_review_reaches_the_team(self):
        self.client.force_authenticate(self.ana)
        response = self.client.post("/api/moderation/reports/", {"target_type": "review", "target_id": self.review.pk, "reason": "offensive"})
        self.assertEqual(response.status_code, 201)
        report = Report.objects.get()
        self.assertEqual((report.reported_user, report.status), (self.bob, ReportStatus.PENDING))
        self.assertEqual(mail.outbox[-1].to, ["equipo@msail.test"])
        # No se puede reportar lo propio, y hace falta sesión.
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.post("/api/moderation/reports/", {"target_type": "user", "target_id": self.bob.pk, "reason": "spam"}).status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post("/api/moderation/reports/", {"target_type": "user", "target_id": self.bob.pk, "reason": "spam"}).status_code, 401)

    def test_block_hides_content_both_ways_and_unblock_restores_it(self):
        self.client.force_authenticate(self.ana)
        self.assertIn(self.bob.pk, self.crew())
        self.assertEqual(self.reviews(), [self.bob.pk])
        self.assertEqual(self.client.post("/api/moderation/blocks/", {"user": self.bob.pk}).status_code, 201)
        self.assertNotIn(self.bob.pk, self.crew())
        self.assertEqual(self.reviews(), [])
        self.assertEqual(self.client.get(f"/api/profiles/{self.bob.pk}/").status_code, 404)
        self.assertEqual([b["user_id"] for b in self.client.get("/api/moderation/blocks/").data], [self.bob.pk])
        # Quien fue bloqueado tampoco ve a quien lo bloqueó.
        self.client.force_authenticate(self.bob)
        self.assertNotIn(self.ana.pk, self.crew())
        # Desbloquear.
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.client.delete(f"/api/moderation/blocks/{self.bob.pk}/").status_code, 204)
        self.assertIn(self.bob.pk, self.crew())
        self.assertFalse(Block.objects.exists())

    def test_admin_hides_reported_content(self):
        Report.objects.create(reporter=self.ana, target_type="review", target_id=self.review.pk, reported_user=self.bob, reason="offensive")
        Report.objects.create(reporter=self.ana, target_type="user", target_id=self.bob.pk, reported_user=self.bob, reason="spam")
        root = User.objects.create_superuser(email="root@msail.test", password="clave-segura-123")
        self.client.force_login(root)
        self.assertEqual(self.client.get("/admin/moderation/report/").status_code, 200)
        report = Report.objects.first()
        self.assertEqual(self.client.get(f"/admin/moderation/report/{report.pk}/change/").status_code, 200)
        self.client.post("/admin/moderation/report/", {"action": "hide_content", "_selected_action": list(Report.objects.values_list("pk", flat=True))})
        self.review.refresh_from_db()
        self.assertFalse(self.review.is_visible)
        self.assertFalse(SailorProfile.objects.get(user=self.bob).is_public)
        self.assertEqual(set(Report.objects.values_list("status", flat=True)), {ReportStatus.ACTIONED})
