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


class CalendarSearchTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.es = Country.objects.get(iso_code="ES")
        cls.br = Country.objects.get(iso_code="BR")
        cls.club = Club.objects.create(name="Real Club Náutico Test", slug="rcn-test", country=cls.es)
        cls.sofia = Event.objects.create(
            name="Trofeo Princesa Sofía", slug="sofia", event_type=EventType.OLYMPIC,
            start_date=days(20), end_date=days(25), country=cls.es, city="Palma", organizer_club=cls.club,
        )
        cls.sofia.boat_classes.set([BoatClass.objects.get(slug="49er")])
        cls.rio = Event.objects.create(
            name="Regata Buenos Aires – Río", slug="ba-rio", event_type=EventType.OFFSHORE,
            start_date=days(40), country=cls.br, city="Río de Janeiro", organizer_name="Yacht Club Argentino",
        )

    def names(self, q):
        return [e["name"] for e in self.client.get("/api/events/", {"q": q}).data["results"]]

    def test_ignores_accents_and_case(self):
        self.assertEqual(self.names("sofia"), ["Trofeo Princesa Sofía"])
        self.assertEqual(self.names("SOFÍA"), ["Trofeo Princesa Sofía"])
        self.assertEqual(self.names("rio"), ["Regata Buenos Aires – Río"])

    def test_searches_city_country_organizer_and_class(self):
        self.assertEqual(self.names("palma"), ["Trofeo Princesa Sofía"])
        self.assertEqual(self.names("españa"), ["Trofeo Princesa Sofía"])
        self.assertEqual(self.names("brazil"), ["Regata Buenos Aires – Río"])  # nombre del país en inglés
        self.assertEqual(self.names("yacht club argentino"), ["Regata Buenos Aires – Río"])
        self.assertEqual(self.names("nautico"), ["Trofeo Princesa Sofía"])
        self.assertEqual(self.names("49er"), ["Trofeo Princesa Sofía"])

    def test_every_word_must_match(self):
        self.assertEqual(self.names("sofia palma"), ["Trofeo Princesa Sofía"])
        self.assertEqual(self.names("sofia janeiro"), [])

    def test_combines_with_filters(self):
        response = self.client.get("/api/events/", {"q": "regata", "country": "ES"})
        self.assertEqual(response.data["count"], 0)

    def test_index_updates_when_classes_or_club_change(self):
        self.sofia.boat_classes.add(BoatClass.objects.get(slug="nacra-17"))
        self.assertEqual(self.names("nacra"), ["Trofeo Princesa Sofía"])
        self.club.name = "Club de Vela Renombrado"
        self.club.save()
        self.assertEqual(self.names("renombrado"), ["Trofeo Princesa Sofía"])


class EventDetailTests(CalendarTestCase):
    def test_detail_by_slug_with_categories_and_organizer(self):
        from .models import EventCategory

        EventCategory.objects.create(event=self.live, name="J/70 Open", boat_class=BoatClass.objects.get(slug="j70"), order=1)
        EventCategory.objects.create(event=self.live, name="Sub-21", order=2)
        response = self.client.get(f"/api/events/{self.live.slug}/")
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(data["status"], "live")
        self.assertEqual(data["duration_days"], 4)
        self.assertEqual(data["organizer_club"]["name"], "Club Test")
        self.assertEqual(data["region"], self.miami.name)
        self.assertEqual([c["name"] for c in data["categories"]], ["J/70 Open", "Sub-21"])
        self.assertEqual(data["categories"][0]["boat_class"], "j70")

    def test_professionals_nearby_or_chosen(self):
        from apps.professionals.models import Professional

        Event.objects.filter(pk=self.live.pk).update(latitude=25.77, longitude=-80.13)  # Miami
        near = Professional.objects.create(name="Velería Miami", slug="veleria-miami", country=self.us, city="Miami", latitude=25.8, longitude=-80.2)
        Professional.objects.create(name="Rigging Lejos", slug="rigging-lejos", country=self.us, city="Newport", latitude=41.49, longitude=-71.31)
        Professional.objects.create(name="Oculto", slug="oculto", country=self.us, city="Miami", latitude=25.8, longitude=-80.2, is_published=False)

        # Sin elegidos en el panel: los publicados cerca de la sede, con la distancia.
        data = self.client.get(f"/api/events/{self.live.slug}/").data["professionals"]
        self.assertFalse(data["linked"])
        self.assertEqual([p["name"] for p in data["items"]], ["Velería Miami"])
        self.assertLess(data["items"][0]["distance_km"], 20)

        # Elegidos en el panel: solo esos, aunque estén lejos.
        lejos = Professional.objects.get(slug="rigging-lejos")
        self.live.professionals.set([lejos])
        data = self.client.get(f"/api/events/{self.live.slug}/").data["professionals"]
        self.assertTrue(data["linked"])
        self.assertEqual([p["name"] for p in data["items"]], ["Rigging Lejos"])
        self.assertNotIn(near.name, [p["name"] for p in data["items"]])

    def test_start_only_event_has_no_duration(self):
        data = self.client.get(f"/api/events/{self.later.slug}/").data
        self.assertIsNone(data["duration_days"])
        self.assertIsNone(data["organizer_club"])

    def test_unpublished_or_missing_is_404(self):
        self.assertEqual(self.client.get(f"/api/events/{self.hidden.slug}/").status_code, 404)
        self.assertEqual(self.client.get("/api/events/no-existe/").status_code, 404)
