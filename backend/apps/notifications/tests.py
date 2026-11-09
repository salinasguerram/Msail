from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.events.models import Event, EventFollow, EventResult, EventType
from apps.events.results_import import import_results, parse_csv
from apps.geo.models import Country

from .models import Notification, NotificationKind
from .services import notify_followers

User = get_user_model()


def days(n):
    return timezone.localdate() + timedelta(days=n)


class Base:
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.es = Country.objects.get(iso_code="ES")
        cls.ana = User.objects.create_user(email="ana@example.com", password="vela-segura-123", email_verified=True)
        cls.tom = User.objects.create_user(
            email="tom@example.com", password="vela-segura-123", email_verified=True, preferred_language="en"
        )
        cls.event = Event.objects.create(
            name="Copa Avisos", slug="copa-avisos", event_type=EventType.INSHORE, start_date=days(-3), end_date=days(-1),
            country=cls.es, city="Palma",
        )

    def follow(self, *users, event=None):
        for user in users:
            EventFollow.objects.create(user=user, event=event or self.event)


class FollowApiTests(Base, APITestCase):
    def test_follow_unfollow_and_detail_flags(self):
        url = "/api/events/copa-avisos/follow/"
        self.assertEqual(self.client.post(url).status_code, 401)
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.client.post(url).data, {"following": True, "followers_count": 1})
        self.assertEqual(self.client.post(url).data["followers_count"], 1)  # seguir dos veces no duplica
        detail = self.client.get("/api/events/copa-avisos/").data
        self.assertTrue(detail["is_following"])
        self.assertEqual(detail["followers_count"], 1)
        self.assertEqual(self.client.delete(url).data, {"following": False, "followers_count": 0})
        self.assertFalse(self.client.get("/api/events/copa-avisos/").data["is_following"])

    def test_following_filter_in_calendar(self):
        Event.objects.create(name="Otra", slug="otra", event_type=EventType.INSHORE, start_date=days(10), country=self.es)
        self.follow(self.ana)
        self.assertEqual(self.client.get("/api/events/?following=1").data["count"], 0)  # sin sesión: nada
        self.client.force_authenticate(self.ana)
        slugs = [e["slug"] for e in self.client.get("/api/events/?following=1").data["results"]]
        self.assertEqual(slugs, ["copa-avisos"])

    def test_cannot_follow_unpublished_event(self):
        Event.objects.filter(pk=self.event.pk).update(is_published=False)
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.client.post("/api/events/copa-avisos/follow/").status_code, 404)


class NotifyTests(Base, TestCase):
    def test_results_notify_once_in_each_language_and_email(self):
        self.follow(self.ana, self.tom)
        with self.captureOnCommitCallbacks(execute=True):
            EventResult.objects.create(event=self.event, position=1, boat_name="Nola")
            EventResult.objects.create(event=self.event, position=2, boat_name="Vudu")
        titles = dict(Notification.objects.values_list("user__email", "title"))
        self.assertEqual(titles, {"ana@example.com": "Resultados de Copa Avisos", "tom@example.com": "Results of Copa Avisos"})
        self.assertEqual(len(mail.outbox), 2)
        english = next(m for m in mail.outbox if m.to == ["tom@example.com"])
        self.assertIn("/events/copa-avisos", english.body)
        self.assertTrue(Notification.objects.filter(emailed=True).count() == 2)

    def test_csv_import_notifies_and_reimport_does_not_repeat(self):
        self.follow(self.ana)
        rows, _ = parse_csv("puesto;barco\n1;Nola\n".encode())
        import_results(self.event, rows)
        import_results(self.event, rows)
        self.assertEqual(Notification.objects.filter(kind=NotificationKind.RESULTS).count(), 1)

    def test_email_respects_preferences_and_verification(self):
        self.ana.email_notifications = False
        self.ana.save()
        unverified = User.objects.create_user(email="sin@example.com", password="vela-segura-123")
        self.follow(self.ana, self.tom, unverified)
        with self.captureOnCommitCallbacks(execute=True):
            notify_followers(self.event, NotificationKind.RESULTS, "results:x")
        self.assertEqual(Notification.objects.count(), 3)  # en la app les llega a todos
        self.assertEqual([m.to for m in mail.outbox], [["tom@example.com"]])

    def test_gallery_notice_is_in_app_only(self):
        self.follow(self.ana)
        with self.captureOnCommitCallbacks(execute=True):
            notify_followers(self.event, NotificationKind.GALLERY, "gallery:x")
        self.assertEqual(Notification.objects.get().kind, NotificationKind.GALLERY)
        self.assertEqual(mail.outbox, [])

    def test_date_change_of_upcoming_event(self):
        upcoming = Event.objects.create(name="Futura", slug="futura", event_type=EventType.INSHORE, start_date=days(20), country=self.es)
        self.follow(self.ana, event=upcoming)
        upcoming.name = "Futura 2027"
        upcoming.save()
        self.assertFalse(Notification.objects.exists())  # cambiar el nombre no avisa
        upcoming.start_date = days(27)
        upcoming.save()
        notification = Notification.objects.get()
        self.assertEqual(notification.kind, NotificationKind.DATES)
        self.assertIn("Futura 2027", notification.title)

    def test_unpublished_event_does_not_notify(self):
        self.follow(self.ana)
        Event.objects.filter(pk=self.event.pk).update(is_published=False)
        self.event.refresh_from_db()
        self.assertEqual(notify_followers(self.event, NotificationKind.RESULTS, "results:x"), 0)


class ReminderCommandTests(Base, TestCase):
    def test_starts_tomorrow_and_entries_closing(self):
        tomorrow = Event.objects.create(name="Mañana", slug="manana", event_type=EventType.INSHORE, start_date=days(1), country=self.es)
        closing = Event.objects.create(
            name="Cierra", slug="cierra", event_type=EventType.INSHORE, start_date=days(15), country=self.es,
            entry_url="https://inscripcion.org", entry_deadline=days(2),
        )
        later = Event.objects.create(
            name="Lejos", slug="lejos", event_type=EventType.INSHORE, start_date=days(30), country=self.es,
            entry_url="https://inscripcion.org", entry_deadline=days(20),
        )
        for event in (tomorrow, closing, later):
            self.follow(self.ana, event=event)
        call_command("send_event_reminders", stdout=StringIO())
        call_command("send_event_reminders", stdout=StringIO())  # dos veces: sin duplicados
        kinds = dict(Notification.objects.values_list("event__slug", "kind"))
        self.assertEqual(kinds, {"manana": NotificationKind.STARTS, "cierra": NotificationKind.ENTRIES})


class NotificationApiTests(Base, APITestCase):
    def setUp(self):
        self.follow(self.ana)
        notify_followers(self.event, NotificationKind.RESULTS, "results:1")
        notify_followers(self.event, NotificationKind.GALLERY, "gallery:1")
        self.client.force_authenticate(self.ana)

    def test_list_count_and_mark_read(self):
        listing = self.client.get("/api/notifications/").data
        self.assertEqual(listing["count"], 2)
        self.assertEqual(listing["results"][0]["event"], "copa-avisos")
        self.assertEqual(self.client.get("/api/notifications/unread/").data, {"unread": 2})
        first = listing["results"][0]["id"]
        self.assertEqual(self.client.post(f"/api/notifications/{first}/read/").data, {"marked": 1, "unread": 1})
        self.assertEqual(self.client.post("/api/notifications/read/").data, {"marked": 1, "unread": 0})

    def test_only_my_notifications(self):
        other = Notification.objects.create(user=self.tom, kind=NotificationKind.RESULTS, title="X", key="k")
        self.assertEqual(self.client.post(f"/api/notifications/{other.id}/read/").data["marked"], 0)
        self.assertEqual(self.client.get("/api/notifications/").data["count"], 2)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/notifications/").status_code, 401)

    def test_email_preference_in_me(self):
        response = self.client.patch("/api/auth/me/", {"email_notifications": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["email_notifications"])
