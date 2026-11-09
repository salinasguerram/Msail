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

    def test_boat_size_filters_leave_out_unknown(self):
        self.assertEqual(self.names("?length=70"), ["Marina Port Vell", "Miami Beach Marina", "Safe Harbor Newport Shipyard"])
        self.assertEqual(self.names("?length=10&draft=4,5"), ["Marina Port Vell", "Safe Harbor Newport Shipyard"])
        self.assertNotIn("Marina da Glória", self.names("?length=5"))  # no informa eslora
        self.assertEqual(self.client.get("/api/marinas/?length=abc").status_code, 400)

    def test_detail_and_filter_options(self):
        data = self.client.get("/api/marinas/cowes-yacht-haven/").data
        self.assertEqual(data["vhf_channel"], "80")
        self.assertEqual(data["max_draft_m"], 3.5)
        self.assertEqual(data["services"], ["water", "electricity", "showers", "wifi", "laundry"])
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
