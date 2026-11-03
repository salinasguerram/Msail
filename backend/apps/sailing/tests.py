from io import StringIO
from django.core.management import call_command
from django.test import TestCase

from apps.geo.models import Country, Region

from .models import BoatClass, Club


class SeedBaseTests(TestCase):
    def test_seed_is_idempotent(self):
        call_command("seed_base", stdout=StringIO())
        counts = (Country.objects.count(), Region.objects.count(), BoatClass.objects.count())
        call_command("seed_base", stdout=StringIO())
        self.assertEqual(counts, (Country.objects.count(), Region.objects.count(), BoatClass.objects.count()))
        self.assertTrue(BoatClass.objects.filter(slug="j70", is_olympic=False).exists())


class ClubTests(TestCase):
    def test_club_with_classes(self):
        call_command("seed_base", stdout=StringIO())
        club = Club.objects.create(
            name="Club de prueba",
            slug="club-de-prueba",
            country=Country.objects.get(iso_code="US"),
            region=Region.objects.filter(country__iso_code="US").first(),
        )
        club.boat_classes.add(*BoatClass.objects.filter(slug__in=["j70", "optimist"]))
        self.assertEqual(club.boat_classes.count(), 2)
        self.assertIn(club, BoatClass.objects.get(slug="j70").clubs.all())
