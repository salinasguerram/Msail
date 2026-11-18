import shutil
import tempfile
from io import BytesIO, StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image
from rest_framework.test import APITestCase

from apps.geo.models import Country, Region

from .models import Marina, MarinaPhoto

MEDIA = tempfile.mkdtemp(prefix="msail-test-marinas-")


def photo(name="foto.jpg"):
    buffer = BytesIO()
    Image.new("RGB", (2400, 1600), (20, 90, 160)).save(buffer, "JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


class MarinaApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        call_command("seed_marinas", stdout=StringIO())
        Marina.objects.create(
            name="Marina Oculta", slug="marina-oculta", country=Country.objects.get(iso_code="ES"), city="Palma", is_published=False
        )

    def names(self, query=""):
        return [m["name"] for m in self.client.get(f"/api/marinas/{query}").data["results"]]

    def test_list_only_published_in_alphabetical_order(self):
        names = self.names()
        self.assertEqual(len(names), 6)
        self.assertEqual(names, sorted(names))
        self.assertNotIn("Marina Oculta", names)

    def test_search_country_and_region(self):
        self.assertEqual(self.names("?q=gloria"), ["Marina da Glória"])  # sin tilde
        self.assertEqual(self.names("?q=mallorca"), ["Puerto Portals"])
        self.assertEqual(self.names("?country=gb"), ["Cowes Yacht Haven"])
        newport = Region.objects.get(slug="rhode-island-newport")
        self.assertEqual(self.names(f"?region={newport.pk}"), ["Safe Harbor Newport Shipyard"])

    def test_services_must_all_match(self):
        self.assertEqual(self.names("?services=fuel,showers"), ["Marina Port Vell", "Puerto Portals", "Safe Harbor Newport Shipyard"])
        self.assertEqual(self.client.get("/api/marinas/?services=spa").status_code, 400)

    def test_place_kind_and_overnight(self):
        # Las de ejemplo son marinas y reciben barcos que pasan la noche a bordo.
        self.assertEqual(len(self.names("?kind=marina&services=overnight")), 6)
        self.assertEqual(self.names("?kind=anchorage"), [])
        self.assertEqual(self.client.get("/api/marinas/?kind=castillo").status_code, 400)
        first = self.client.get("/api/marinas/").data["results"][0]
        self.assertEqual(first["kind"], "marina")
        self.assertIn("overnight", first["services"])

    def test_boat_size_filters_leave_out_unknown(self):
        self.assertEqual(self.names("?length=70"), ["Marina Port Vell", "Miami Beach Marina", "Safe Harbor Newport Shipyard"])
        self.assertEqual(self.names("?length=10&draft=4,5"), ["Marina Port Vell", "Safe Harbor Newport Shipyard"])
        self.assertNotIn("Marina da Glória", self.names("?length=5"))  # no informa eslora
        self.assertEqual(self.client.get("/api/marinas/?length=abc").status_code, 400)

    def test_detail_and_filter_options(self):
        data = self.client.get("/api/marinas/cowes-yacht-haven/").data
        self.assertEqual(data["vhf_channel"], "80")
        self.assertEqual(data["max_draft_m"], 3.5)
        self.assertEqual(data["services"], ["water", "electricity", "showers", "wifi", "laundry", "overnight"])
        self.assertFalse(data["verified"])
        self.assertEqual(self.client.get("/api/marinas/marina-oculta/").status_code, 404)
        countries = self.client.get("/api/marinas/filters/").data["countries"]
        self.assertEqual({c["value"]: c["count"] for c in countries}, {"BR": 1, "ES": 2, "US": 2, "GB": 1})

    def test_seed_is_idempotent(self):
        call_command("seed_marinas", stdout=StringIO())
        self.assertEqual(Marina.objects.count(), 7)


@override_settings(MEDIA_ROOT=MEDIA)
class MarinaPhotoTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.marina = Marina.objects.create(name="Marina Test", slug="marina-test", country=Country.objects.get(iso_code="CL"), city="Algarrobo")
        cls.admin = get_user_model().objects.create_superuser(email="admin@msail.com", password="x-segura-123")

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def test_photo_processing_cover_and_cleanup(self):
        second = MarinaPhoto.objects.create(marina=self.marina, image=photo("b.jpg"), order=2)
        first = MarinaPhoto.objects.create(marina=self.marina, image=photo("a.jpg"), order=1)
        with Image.open(first.image.path) as big, Image.open(first.thumbnail.path) as thumb:
            self.assertEqual(max(big.size), 1600)
            self.assertEqual(thumb.size, (MarinaPhoto.THUMB_SIDE, MarinaPhoto.THUMB_SIDE))
        data = self.client.get("/api/marinas/marina-test/").data
        self.assertIn(Path(first.thumbnail.name).name, data["cover"])  # la de menor orden es la portada
        self.assertEqual([p["id"] for p in data["photos"]], [first.id, second.id])
        paths = [Path(first.image.path), Path(first.thumbnail.path)]
        first.delete()
        self.assertFalse(any(p.exists() for p in paths))

    def test_rejects_fake_image(self):
        fake = SimpleUploadedFile("x.jpg", b"no soy una foto", content_type="image/jpeg")
        with self.assertRaises(ValidationError):
            MarinaPhoto(marina=self.marina, image=fake).full_clean()

    def test_panel_pages(self):
        self.client.force_login(self.admin)
        self.assertContains(self.client.get(reverse("admin:marinas_marina_changelist")), "Marina Test")
        change = self.client.get(reverse("admin:marinas_marina_change", args=[self.marina.pk]))
        self.assertContains(change, "Servicios informados")
        self.assertContains(change, "/marinas/marina-test")


class MarinaRateTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        from .models import MarinaRate, RateUnit

        es = Country.objects.get(iso_code="ES")
        cls.with_price = Marina.objects.create(name="Con Precio", slug="con-precio", country=es, city="Palma")
        cls.without = Marina.objects.create(name="Sin Precio", slug="sin-precio", country=es, city="Palma")
        MarinaRate.objects.create(marina=cls.with_price, label="Mensual", amount="900", unit=RateUnit.PER_BOAT_MONTH, order=2)
        MarinaRate.objects.create(
            marina=cls.with_price, label="Temporada alta", amount="4.90", currency="GBP", unit=RateUnit.PER_METER_NIGHT,
            min_length_m="8", max_length_m="20", order=1,
        )
        cls.admin = get_user_model().objects.create_superuser(email="admin@msail.com", password="x-segura-123")

    def test_headline_rate_and_detail(self):
        rows = {m["slug"]: m for m in self.client.get("/api/marinas/").data["results"]}
        self.assertEqual(
            rows["con-precio"]["headline_rate"],
            {
                "id": rows["con-precio"]["headline_rate"]["id"], "label": "Temporada alta", "amount": 4.9, "currency": "GBP",
                "unit": "meter_night", "min_length_m": 8.0, "max_length_m": 20.0,
            },
        )
        self.assertIsNone(rows["sin-precio"]["headline_rate"])
        detail = self.client.get("/api/marinas/con-precio/").data
        self.assertEqual([r["label"] for r in detail["rates"]], ["Temporada alta", "Mensual"])
        self.assertEqual(self.client.get("/api/marinas/sin-precio/").data["rates"], [])

    def test_with_price_filter(self):
        slugs = [m["slug"] for m in self.client.get("/api/marinas/?with_price=1").data["results"]]
        self.assertEqual(slugs, ["con-precio"])  # una sola vez aunque tenga dos tarifas

    def test_length_range_validation(self):
        from .models import MarinaRate

        with self.assertRaises(ValidationError):
            MarinaRate(marina=self.without, label="Mal", amount="1", min_length_m="20", max_length_m="10").full_clean()

    def test_rates_from_panel(self):
        self.client.force_login(self.admin)
        response = self.client.get(reverse("admin:marinas_marina_change", args=[self.with_price.pk]))
        html = response.content.decode().lower()
        self.assertIn("tarifas orientativas", html)
        self.assertIn("temporada alta", html)
        self.assertIn("precio orientativo", html)
