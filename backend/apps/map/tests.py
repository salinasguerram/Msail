from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.events.models import Event, EventType
from apps.geo.models import Country
from apps.marinas.models import Marina
from apps.professionals.models import Professional, Specialty


class MapPointsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        es = Country.objects.get(iso_code="ES")
        today = timezone.localdate()
        common = {"event_type": EventType.INSHORE, "country": es, "city": "Palma", "latitude": 39.55, "longitude": 2.62}
        Event.objects.create(name="Próxima", slug="proxima", start_date=today + timedelta(days=10), **common)
        Event.objects.create(name="En curso", slug="en-curso", start_date=today - timedelta(days=1), end_date=today + timedelta(days=1), **common)
        Event.objects.create(name="Pasada", slug="pasada", start_date=today - timedelta(days=30), **common)
        Event.objects.create(name="Oculta", slug="oculta", start_date=today + timedelta(days=5), is_published=False, **common)
        Event.objects.create(name="Sin coordenadas", slug="sin-coords", start_date=today + timedelta(days=5), event_type=EventType.INSHORE, country=es)
        Marina.objects.create(name="Marina A", slug="marina-a", country=es, city="Palma", latitude=39.56, longitude=2.63)
        Marina.objects.create(name="Marina sin mapa", slug="marina-b", country=es, city="Palma")
        pro = Professional.objects.create(name="Velas Uno", slug="velas-uno", country=es, city="Palma", latitude=39.57, longitude=2.64)
        pro.specialties.set(Specialty.objects.filter(slug__in=["sailmaking", "rigging"]))

    def test_points_and_counts(self):
        data = self.client.get("/api/map/points/").data
        ids = [p["id"] for p in data["points"]]
        self.assertEqual(ids, ["event:en-curso", "event:proxima", "marina:marina-a", "professional:velas-uno"])
        self.assertEqual(data["counts"], {"event": 2, "marina": 1, "professional": 1})
        live = data["points"][0]
        self.assertTrue(live["live"])
        self.assertEqual((live["lat"], live["lng"]), (39.55, 2.62))
        self.assertEqual(data["points"][3]["subtitle"], "Velería · Rigging / jarcia")

    def test_summary_fields(self):
        from apps.professionals.models import Review
        from django.contrib.auth import get_user_model

        Marina.objects.filter(slug="marina-a").update(max_length_m=60, berths=640, fuel=True, water=True)
        user = get_user_model().objects.create_user(email="ana@example.com", password="x-segura-123")
        Review.objects.create(professional=Professional.objects.get(slug="velas-uno"), user=user, rating=4)
        points = {p["id"]: p for p in self.client.get("/api/map/points/").data["points"]}
        self.assertEqual(points["event:en-curso"]["end_date"], timezone.localdate() + timedelta(days=1))
        marina = points["marina:marina-a"]
        self.assertEqual((marina["max_length_m"], marina["berths"], marina["services"]), (60.0, 640, 2))
        pro = points["professional:velas-uno"]
        self.assertEqual((pro["rating"], pro["reviews_count"], pro["city"]), (4.0, 1, "Palma"))
        self.assertEqual((pro["country"], pro["country_name"]), ("ES", "España"))
        self.assertEqual({p["country"] for p in points.values()}, {"ES"})

    def test_specialties_in_english(self):
        data = self.client.get("/api/map/points/", HTTP_ACCEPT_LANGUAGE="en").data
        self.assertEqual(data["points"][-1]["subtitle"], "Sailmaking · Rigging")
