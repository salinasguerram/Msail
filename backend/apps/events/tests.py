from datetime import timedelta
from io import StringIO

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.geo.models import Country, Region
from apps.sailing.models import BoatClass, Club

from .models import Event, EventStatus, EventType


def days(n):
    return timezone.localdate() + timedelta(days=n)


class CalendarTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.es = Country.objects.get(iso_code="ES")
        cls.us = Country.objects.get(iso_code="US")
        cls.miami = Region.objects.get(slug="florida-miami")
        cls.club = Club.objects.create(name="Club Test", slug="club-test", country=cls.us)
        j70 = BoatClass.objects.get(slug="j70")
        ilca = BoatClass.objects.get(slug="ilca-7")

        def event(name, start, end=None, country=None, kind=EventType.INSHORE, classes=(), **extra):
            e = Event.objects.create(
                name=name, slug=name.lower().replace(" ", "-"), event_type=kind,
                start_date=start, end_date=end, country=country or cls.es, **extra,
            )
            e.boat_classes.set(classes)
            return e

        cls.past = event("Pasada", days(-30), days(-28), classes=[ilca])
        cls.older = event("Muy pasada", days(-200), days(-198))
        cls.live = event("En curso", days(-1), days(2), country=cls.us, region=cls.miami, organizer_club=cls.club, classes=[j70])
        cls.soon = event("Pronto", days(10), days(12), kind=EventType.OFFSHORE, classes=[j70])
        cls.later = event("Lejana", days(90), None, country=cls.us, kind=EventType.OFFSHORE)
        cls.hidden = event("Oculta", days(5), days(6), is_published=False)

    def names(self, **params):
        response = self.client.get("/api/events/", params)
        self.assertEqual(response.status_code, 200, response.data)
        return [e["name"] for e in response.data["results"]]


class CalendarFilterTests(CalendarTestCase):
    def test_upcoming_includes_live_in_date_order(self):
        self.assertEqual(self.names(when="upcoming"), ["En curso", "Pronto", "Lejana"])

    def test_live_and_past(self):
        self.assertEqual(self.names(when="live"), ["En curso"])
        self.assertEqual(self.names(when="past"), ["Pasada", "Muy pasada"])  # la más reciente primero

    def test_unpublished_never_shown(self):
        self.assertNotIn("Oculta", self.names())

    def test_filter_by_country_class_type_club_region(self):
        self.assertEqual(self.names(country="us", when="upcoming"), ["En curso", "Lejana"])
        self.assertEqual(self.names(**{"class": "j70"}), ["En curso", "Pronto"])
        self.assertEqual(self.names(type="offshore"), ["Pronto", "Lejana"])
        self.assertEqual(self.names(club=self.club.id), ["En curso"])
        self.assertEqual(self.names(region=self.miami.id), ["En curso"])

    def test_date_range_includes_overlapping_events(self):
        # Un rango que empieza en medio de la regata en curso también la incluye.
        self.assertEqual(self.names(**{"from": days(1).isoformat(), "to": days(11).isoformat()}), ["En curso", "Pronto"])

    def test_filters_combine(self):
        self.assertEqual(self.names(country="es", type="offshore", when="upcoming"), ["Pronto"])

    def test_invalid_params(self):
        self.assertEqual(self.client.get("/api/events/", {"when": "ayer"}).status_code, 400)
        self.assertEqual(self.client.get("/api/events/", {"type": "pirata"}).status_code, 400)
        self.assertEqual(self.client.get("/api/events/", {"from": "15/03/2027"}).status_code, 400)
        self.assertEqual(self.names(club="abc"), [])

    def test_row_data(self):
        row = next(e for e in self.client.get("/api/events/").data["results"] if e["name"] == "En curso")
        self.assertEqual(row["status"], "live")
        self.assertEqual(row["country"], "US")
        self.assertEqual(row["organizer"], "Club Test")
        self.assertEqual(row["boat_classes"], ["j70"])


class EventModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())

    def test_status_with_and_without_end_date(self):
        es = Country.objects.get(iso_code="ES")
        one_day = Event(name="X", slug="x", event_type=EventType.OFFSHORE, start_date=timezone.localdate(), country=es)
        self.assertEqual(one_day.status, EventStatus.LIVE)
        one_day.start_date = days(1)
        self.assertEqual(one_day.status, EventStatus.UPCOMING)

    def test_validation(self):
        es = Country.objects.get(iso_code="ES")
        bad = Event(name="X", slug="x", event_type=EventType.INSHORE, start_date=days(5), end_date=days(1), country=es)
        with self.assertRaises(ValidationError):
            bad.clean()
        wrong_region = Event(
            name="Y", slug="y", event_type=EventType.INSHORE, start_date=days(1), country=es,
            region=Region.objects.get(slug="florida-miami"),
        )
        with self.assertRaises(ValidationError):
            wrong_region.clean()

    def test_seed_events_is_idempotent_and_links_clubs(self):
        call_command("seed_clubs", stdout=StringIO())
        call_command("seed_events", stdout=StringIO())
        total = Event.objects.count()
        call_command("seed_events", stdout=StringIO())
        self.assertEqual(Event.objects.count(), total)
        self.assertEqual(Event.objects.get(slug="bacardi-cup-2027-100a-edicion").organizer, "Coral Reef Yacht Club")
        self.assertTrue(Event.objects.filter(organizer_club__isnull=True).exclude(organizer_name="").exists())
