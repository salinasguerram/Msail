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

from apps.geo.models import Country

from .models import DEFAULT_SPECIALTIES, Professional, ProfessionalPhoto, Specialty

MEDIA = tempfile.mkdtemp(prefix="msail-test-pros-")


def photo(name="foto.jpg", size=(2000, 1500)):
    buffer = BytesIO()
    Image.new("RGB", size, (20, 90, 160)).save(buffer, "JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


class DirectoryApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        call_command("seed_professionals", stdout=StringIO())
        hidden = Professional.objects.create(name="Oculto", slug="oculto", country=Country.objects.get(iso_code="ES"), city="Palma", is_published=False)
        hidden.specialties.set([Specialty.objects.get(slug="rigging")])

    def names(self, query=""):
        return [p["name"] for p in self.client.get(f"/api/professionals/{query}").data["results"]]

    def test_default_specialties_exist(self):
        self.assertEqual(Specialty.objects.count(), len(DEFAULT_SPECIALTIES))

    def test_list_only_published(self):
        names = self.names()
        self.assertEqual(len(names), 5)
        self.assertNotIn("Oculto", names)

    def test_filters(self):
        self.assertEqual(self.names("?specialty=rigging"), ["North Sails Palma", "Spencer Rigging"])
        self.assertEqual(self.names("?country=gb"), ["Richardsons Yacht Services", "Spencer Rigging"])
        self.assertEqual(self.names("?specialty=sailmaking&country=AR"), ["Oscar Salas · North Sails"])

    def test_search_includes_specialty_names_and_ignores_accents(self):
        self.assertEqual(self.names("?q=jarcia"), ["North Sails Palma", "Spencer Rigging"])  # nombre de la especialidad
        self.assertEqual(self.names("?q=velería palma"), ["North Sails Palma"])
        self.assertEqual(self.names("?q=VELERIA mar del plata"), ["Oscar Salas · North Sails"])

    def test_specialty_change_updates_search(self):
        spencer = Professional.objects.get(slug="spencer-rigging")
        spencer.specialties.add(Specialty.objects.get(slug="diving"))
        self.assertIn("Spencer Rigging", self.names("?q=buzo"))

    def test_filter_options_and_language(self):
        data = self.client.get("/api/professionals/filters/").data
        counts = {s["slug"]: s["count"] for s in data["specialties"]}
        self.assertEqual(counts["sailmaking"], 3)
        self.assertEqual(counts["coaching"], 0)
        self.assertEqual(list(counts)[0], "sailmaking")  # orden de la lista, no alfabético
        self.assertEqual({c["value"] for c in data["countries"]}, {"AR", "ES", "US", "GB"})
        english = self.client.get("/api/professionals/quantum-sails-annapolis/", HTTP_ACCEPT_LANGUAGE="en").data
        self.assertEqual([s["name"] for s in english["specialties"]], ["Sailmaking", "Canvas & upholstery"])

    def test_detail(self):
        data = self.client.get("/api/professionals/quantum-sails-annapolis/").data
        self.assertEqual(data["phone"], "+1 410 268 1161")
        self.assertEqual(data["address"], "104 Severn Avenue, Annapolis, MD 21403")
        self.assertFalse(data["verified"])
        self.assertEqual(self.client.get("/api/professionals/oculto/").status_code, 404)

    def test_seed_is_idempotent(self):
        call_command("seed_professionals", stdout=StringIO())
        self.assertEqual(Professional.objects.count(), 6)


@override_settings(MEDIA_ROOT=MEDIA)
class PhotosAndPanelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.pro = Professional.objects.create(name="Rigger Test", slug="rigger-test", country=Country.objects.get(iso_code="CL"), city="Algarrobo")
        cls.admin = get_user_model().objects.create_superuser(email="admin@msail.com", password="x-segura-123")

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def test_logo_is_square_and_photos_get_thumbnails(self):
        self.pro.logo = photo("logo.jpg", size=(900, 500))
        self.pro.full_clean()
        self.pro.save()
        with Image.open(self.pro.logo.path) as logo:
            self.assertEqual(logo.size, (400, 400))
        item = ProfessionalPhoto.objects.create(professional=self.pro, image=photo())
        with Image.open(item.thumbnail.path) as thumb:
            self.assertEqual(thumb.size, (ProfessionalPhoto.THUMB_SIDE, ProfessionalPhoto.THUMB_SIDE))
        paths = [Path(item.image.path), Path(item.thumbnail.path)]
        item.delete()
        self.assertFalse(any(p.exists() for p in paths))

    def test_rejects_fake_logo(self):
        self.pro.logo = SimpleUploadedFile("x.jpg", b"no soy una imagen", content_type="image/jpeg")
        with self.assertRaises(ValidationError):
            self.pro.full_clean()

    def test_panel(self):
        self.client.force_login(self.admin)
        self.assertContains(self.client.get(reverse("admin:professionals_professional_changelist")), "Rigger Test")
        self.assertContains(self.client.get(reverse("admin:professionals_professional_change", args=[self.pro.pk])), "/professionals/rigger-test")
        self.client.post(
            reverse("admin:professionals_professional_changelist"), {"action": "unpublish", "_selected_action": [str(self.pro.pk)]}
        )
        self.pro.refresh_from_db()
        self.assertFalse(self.pro.is_published)
