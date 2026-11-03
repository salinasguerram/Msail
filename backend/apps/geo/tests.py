from django.db import IntegrityError
from django.test import TestCase
from django.utils import translation

from .models import Continent, Country, Region


class CountryTests(TestCase):
    def setUp(self):
        self.spain = Country.objects.create(
            iso_code="ES", name_es="España", name_en="Spain", continent=Continent.EUROPE
        )

    def test_name_follows_active_language(self):
        with translation.override("es"):
            self.assertEqual(str(self.spain), "España")
        with translation.override("en"):
            self.assertEqual(str(self.spain), "Spain")

    def test_region_slug_unique_per_country(self):
        Region.objects.create(country=self.spain, name_es="Baleares", name_en="Balearics", slug="balearics")
        with self.assertRaises(IntegrityError):
            Region.objects.create(country=self.spain, name_es="Otra", name_en="Other", slug="balearics")
