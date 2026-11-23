import hashlib
import hmac
import json
import time
from datetime import timedelta
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.msailing.models import Video
from apps.sailing.models import BoatClass
from config.dashboard import premium_stats

from . import stripe
from .models import Plan, Source, Status, Subscription, is_premium

User = get_user_model()


def make_user(email="ana@example.com", **extra):
    return User.objects.create_user(email=email, password="clave-segura-123", **extra)


def signed(payload: dict, secret="whsec_test", when=None):
    body = json.dumps(payload).encode()
    t = int(when or time.time())
    sig = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return body, f"t={t},v1={sig}"


class MembershipTests(TestCase):
    def test_access_depends_on_status_and_end_date(self):
        user = make_user()
        self.assertFalse(is_premium(user))
        sub = Subscription.objects.create(user=user, current_period_end=timezone.now() + timedelta(days=3))
        self.assertTrue(is_premium(user))
        sub.status = Status.PAST_DUE  # mientras Stripe reintenta el cobro se mantiene el acceso
        sub.save()
        self.assertTrue(is_premium(user))
        sub.current_period_end = timezone.now() - timedelta(minutes=1)
        sub.save()
        self.assertFalse(is_premium(user))
        Subscription.objects.create(user=user, status=Status.ACTIVE, current_period_end=None)  # cortesía sin fecha
        self.assertTrue(is_premium(user))
        Subscription.objects.filter(user=user).update(status=Status.CANCELED)
        self.assertFalse(is_premium(user))

    def test_dashboard_counts_members_and_monthly_revenue(self):
        monthly = Plan.objects.create(name_es="Mensual", price=10, interval="month")
        yearly = Plan.objects.create(name_es="Anual", price=120, interval="year")
        Subscription.objects.create(user=make_user("a@x.com"), plan=monthly)
        Subscription.objects.create(user=make_user("b@x.com"), plan=yearly)
        Subscription.objects.create(user=make_user("c@x.com"), plan=monthly, status=Status.CANCELED, canceled_at=timezone.now())
        stats = premium_stats()
        self.assertEqual(stats["active"], 2)
        self.assertEqual(stats["canceled"], 1)
        self.assertEqual(stats["revenue"], "20 USD")  # 10 por mes + 120/12
        self.assertEqual({p["name"]: p["total"] for p in stats["by_plan"]}, {"Mensual": 1, "Anual": 1})

    def test_seed_creates_plans_and_lessons_once(self):
        BoatClass.objects.get_or_create(slug="optimist", defaults={"name": "Optimist", "category": "dinghy"})
        call_command("seed_premium", stdout=StringIO())
        call_command("seed_premium", stdout=StringIO())
        self.assertEqual(Plan.objects.count(), 2)
        self.assertEqual(Video.objects.filter(kind="lesson").count(), 4)
        optimist = Video.objects.get(title__startswith="Optimist")
        self.assertEqual(list(optimist.boat_classes.values_list("slug", flat=True)), ["optimist"])


class PremiumContentApiTests(APITestCase):
    def setUp(self):
        self.ilca, _ = BoatClass.objects.get_or_create(slug="ilca-7", defaults={"name": "ILCA 7", "category": "dinghy"})
        self.free = Video.objects.create(title="Gratis", url="https://youtu.be/dQw4w9WgXcQ")
        self.premium = Video.objects.create(
            title="Exclusivo", url="https://vimeo.com/1", body="Texto secreto", kind="lesson", is_premium=True
        )
        self.premium.boat_classes.add(self.ilca)

    def videos(self):
        return {v["title"]: v for v in self.client.get("/api/msailing/").data["videos"]}

    def test_premium_content_is_locked_for_free_users(self):
        videos = self.videos()
        self.assertFalse(videos["Gratis"]["locked"])
        self.assertEqual(videos["Gratis"]["url"], "https://youtu.be/dQw4w9WgXcQ")
        self.assertTrue(videos["Exclusivo"]["locked"])
        self.assertEqual(videos["Exclusivo"]["url"], "")
        self.assertEqual(videos["Exclusivo"]["boat_classes"], ["ilca-7"])
        detail = self.client.get(f"/api/msailing/videos/{self.premium.pk}/").data
        self.assertEqual(detail["body"], "")
        self.premium.refresh_from_db()
        self.assertEqual(self.premium.views, 0)  # bloqueado: no cuenta como vista

    def test_only_subscribers_see_premium_content(self):
        user = make_user()
        Subscription.objects.create(user=user, current_period_end=timezone.now() + timedelta(days=30))
        self.client.force_authenticate(user)
        self.assertFalse(self.videos()["Exclusivo"]["locked"])
        detail = self.client.get(f"/api/msailing/videos/{self.premium.pk}/").data
        self.assertEqual((detail["body"], detail["url"]), ("Texto secreto", "https://vimeo.com/1"))
        self.premium.refresh_from_db()
        self.assertEqual(self.premium.views, 1)
        self.assertTrue(self.client.get("/api/auth/me/").data["is_premium"])

        # El equipo de MSAIL sin membresía lo ve bloqueado como cualquiera (lo revisa desde el panel).
        self.client.force_authenticate(make_user("staff@example.com", is_staff=True))
        self.assertTrue(self.videos()["Exclusivo"]["locked"])
        self.assertEqual(self.client.get(f"/api/msailing/videos/{self.premium.pk}/").data["body"], "")


@override_settings(STRIPE_SECRET_KEY="", STRIPE_WEBHOOK_SECRET="whsec_test")
class PremiumApiTests(APITestCase):
    def setUp(self):
        self.plan = Plan.objects.create(
            name_es="Mensual", name_en="Monthly", price=9.99, features_es="Uno\n- Dos\n", stripe_price_id="price_1"
        )
        Plan.objects.create(name_es="Viejo", price=5, is_active=False)
        self.user = make_user()

    def test_plans_without_payments_enabled(self):
        data = self.client.get("/api/premium/").data
        self.assertEqual([p["name"] for p in data["plans"]], ["Mensual"])
        self.assertEqual(data["plans"][0]["features"], ["Uno", "Dos"])
        self.assertFalse(data["plans"][0]["can_buy"])
        self.assertFalse(data["is_premium"])
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post("/api/premium/checkout/", {"plan": self.plan.pk}).status_code, 503)

    def test_checkout_needs_login(self):
        self.assertEqual(self.client.post("/api/premium/checkout/", {"plan": self.plan.pk}).status_code, 401)

    @override_settings(STRIPE_SECRET_KEY="sk_test_x", FRONTEND_URL="https://app.test")
    def test_checkout_returns_stripe_url(self):
        self.client.force_authenticate(self.user)
        with mock.patch.object(stripe, "_call", return_value={"url": "https://checkout.stripe.com/c/1"}) as call:
            response = self.client.post("/api/premium/checkout/", {"plan": self.plan.pk})
        self.assertEqual(response.data, {"url": "https://checkout.stripe.com/c/1"})
        data = call.call_args.args[2]
        self.assertEqual(data["line_items[0][price]"], "price_1")
        self.assertEqual(data["customer_email"], "ana@example.com")
        self.assertEqual(data["success_url"], "https://app.test/premium?checkout=success")
        Subscription.objects.create(user=self.user)
        self.assertEqual(self.client.post("/api/premium/checkout/", {"plan": self.plan.pk}).status_code, 409)

    def webhook(self, payload, **kwargs):
        body, header = signed(payload, **kwargs)
        return self.client.post("/api/premium/stripe/webhook/", body, content_type="application/json", HTTP_STRIPE_SIGNATURE=header)

    def test_webhook_creates_and_updates_subscription(self):
        end = int(time.time()) + 30 * 86400
        sub = {
            "id": "sub_1",
            "customer": "cus_1",
            "status": "active",
            "start_date": int(time.time()),
            "cancel_at_period_end": False,
            "canceled_at": None,
            "items": {"data": [{"current_period_end": end}]},
            "metadata": {"user_id": str(self.user.pk), "plan_id": str(self.plan.pk)},
        }
        self.assertEqual(self.webhook({"type": "customer.subscription.created", "data": {"object": sub}}).status_code, 200)
        subscription = Subscription.objects.get()
        self.assertEqual((subscription.source, subscription.plan, subscription.stripe_customer_id), (Source.STRIPE, self.plan, "cus_1"))
        self.assertEqual(int(subscription.current_period_end.timestamp()), end)
        self.assertTrue(is_premium(self.user))

        canceled = {**sub, "status": "canceled", "canceled_at": int(time.time())}
        self.webhook({"type": "customer.subscription.deleted", "data": {"object": canceled}})
        self.assertEqual(Subscription.objects.count(), 1)
        self.assertFalse(is_premium(self.user))

    def test_webhook_rejects_bad_or_old_signatures(self):
        event = {"type": "customer.subscription.created", "data": {"object": {"id": "sub_x", "metadata": {"user_id": str(self.user.pk)}}}}
        self.assertEqual(self.webhook(event, secret="whsec_otro").status_code, 400)
        self.assertEqual(self.webhook(event, when=time.time() - 3600).status_code, 400)
        self.assertEqual(Subscription.objects.count(), 0)


class PremiumAdminTests(TestCase):
    def test_admin_pages_and_dashboard_render(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="clave-segura-123")
        self.client.force_login(admin)
        plan = Plan.objects.create(name_es="Mensual", price=10)
        sub = Subscription.objects.create(user=admin, plan=plan)
        video = Video.objects.create(title="Visto", url="https://vimeo.com/2", views=7, is_premium=True)
        pages = [
            "/admin/premium/subscription/",
            "/admin/premium/plan/",
            f"/admin/premium/subscription/{sub.pk}/change/",
            "/admin/msailing/video/",
            f"/admin/msailing/video/{video.pk}/change/",
        ]
        for url in pages:
            self.assertEqual(self.client.get(url).status_code, 200, url)
        home = self.client.get("/admin/").content.decode()
        self.assertIn("Premium activos", home)
        self.assertIn(video.title, home)
        self.client.post("/admin/premium/subscription/", {"action": "extend_month", "_selected_action": [sub.pk]})
        sub.refresh_from_db()
        self.assertGreater(sub.current_period_end, timezone.now() + timedelta(days=29))
