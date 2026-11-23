import shutil
import tempfile
from io import BytesIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APITestCase

from apps.boats.models import Boat, BoatPhoto, CrewMember
from apps.profiles.models import ProfilePhoto, SailorProfile

User = get_user_model()
MEDIA = tempfile.mkdtemp(prefix="msail-test-media-")


def make_image(size=(800, 600), fmt="JPEG", mode="RGB", gps=False, name=None):
    image = Image.new(mode, size, (40, 120, 220, 128) if mode == "RGBA" else (40, 120, 220))
    buffer = BytesIO()
    kwargs = {}
    if gps:
        exif = Image.Exif()
        exif[0x8825] = {2: (34.0, 36.0, 0.0), 4: (58.0, 22.0, 0.0)}  # GPSInfo
        exif[0x010F] = "CamaraDePrueba"  # Make
        kwargs["exif"] = exif
    image.save(buffer, format=fmt, **kwargs)
    return SimpleUploadedFile(name or f"foto.{fmt.lower()}", buffer.getvalue(), content_type=f"image/{fmt.lower()}")


@override_settings(MEDIA_ROOT=MEDIA)
class PhotoTestCase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="foto@example.com", password="x-segura-123")
        self.other = User.objects.create_user(email="otro@example.com", password="x-segura-123")
        self.client.force_authenticate(self.user)

    def stored(self, field_file):
        return Image.open(Path(MEDIA) / field_file.name)


class ImageProcessingTests(PhotoTestCase):
    def test_avatar_is_square_jpeg_without_exif(self):
        response = self.client.post("/api/profiles/me/avatar/", {"image": make_image((1200, 800), gps=True)}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["avatar"].startswith("http"))
        stored = self.stored(SailorProfile.objects.get(user=self.user).avatar)
        self.assertEqual(stored.format, "JPEG")
        self.assertEqual(stored.size, (512, 512))
        self.assertEqual(len(stored.getexif()), 0)  # sin GPS ni datos de cámara

    def test_large_photo_is_resized_keeping_ratio(self):
        response = self.client.post("/api/profiles/me/photos/", {"image": make_image((4000, 3000))}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        stored = self.stored(ProfilePhoto.objects.get().image)
        self.assertEqual(stored.size, (1600, 1200))

    def test_png_with_transparency_is_flattened(self):
        response = self.client.post(
            "/api/profiles/me/photos/", {"image": make_image(fmt="PNG", mode="RGBA")}, format="multipart"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.stored(ProfilePhoto.objects.get().image).mode, "RGB")

    def test_rejects_non_image_files(self):
        fake = SimpleUploadedFile("virus.jpg", b"esto no es una imagen", content_type="image/jpeg")
        response = self.client.post("/api/profiles/me/photos/", {"image": fake}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertIn("image", response.data)

    @override_settings(PHOTO_MAX_UPLOAD_MB=0.0001)
    def test_rejects_too_large_files(self):
        response = self.client.post("/api/profiles/me/photos/", {"image": make_image()}, format="multipart")
        self.assertEqual(response.status_code, 400)


class ProfilePhotoTests(PhotoTestCase):
    def test_profile_includes_avatar_and_gallery(self):
        self.client.post("/api/profiles/me/avatar/", {"image": make_image()}, format="multipart")
        self.client.post("/api/profiles/me/photos/", {"image": make_image(), "caption": "Nacional 2025"}, format="multipart")
        data = self.client.get("/api/profiles/me/").data
        self.assertIsNotNone(data["avatar"])
        self.assertEqual(data["photos"][0]["caption"], "Nacional 2025")

    def test_replacing_avatar_deletes_old_file(self):
        self.client.post("/api/profiles/me/avatar/", {"image": make_image()}, format="multipart")
        old = SailorProfile.objects.get(user=self.user).avatar.name
        self.client.post("/api/profiles/me/avatar/", {"image": make_image()}, format="multipart")
        self.assertFalse((Path(MEDIA) / old).exists())

    def test_delete_avatar(self):
        self.client.post("/api/profiles/me/avatar/", {"image": make_image()}, format="multipart")
        name = SailorProfile.objects.get(user=self.user).avatar.name
        self.assertEqual(self.client.delete("/api/profiles/me/avatar/").status_code, 204)
        self.assertFalse(SailorProfile.objects.get(user=self.user).avatar)
        self.assertFalse((Path(MEDIA) / name).exists())

    def test_delete_photo_removes_file(self):
        photo_id = self.client.post("/api/profiles/me/photos/", {"image": make_image()}, format="multipart").data["id"]
        name = ProfilePhoto.objects.get(pk=photo_id).image.name
        self.assertEqual(self.client.delete(f"/api/profiles/me/photos/{photo_id}/").status_code, 204)
        self.assertFalse((Path(MEDIA) / name).exists())

    def test_cannot_delete_someone_elses_photo(self):
        photo_id = self.client.post("/api/profiles/me/photos/", {"image": make_image()}, format="multipart").data["id"]
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.delete(f"/api/profiles/me/photos/{photo_id}/").status_code, 404)

    def test_gallery_limit(self):
        profile = SailorProfile.objects.get(user=self.user)
        for _ in range(ProfilePhoto.MAX_PER_PROFILE):
            ProfilePhoto.objects.create(profile=profile, image="sailors/x.jpg")
        response = self.client.post("/api/profiles/me/photos/", {"image": make_image()}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_requires_login(self):
        self.client.force_authenticate(None)
        response = self.client.post("/api/profiles/me/avatar/", {"image": make_image()}, format="multipart")
        self.assertEqual(response.status_code, 401)


class BoatPhotoTests(PhotoTestCase):
    def setUp(self):
        super().setUp()
        self.boat = Boat.objects.create(owner=self.user, name="Brisa")

    def upload(self, **extra):
        return self.client.post(f"/api/boats/{self.boat.id}/photos/", {"image": make_image(), **extra}, format="multipart")

    def test_first_photo_becomes_cover(self):
        first = self.upload().data
        second = self.upload().data
        self.assertTrue(first["is_cover"])
        self.assertFalse(second["is_cover"])
        boat = self.client.get(f"/api/boats/{self.boat.id}/").data
        self.assertEqual(len(boat["photos"]), 2)
        self.assertTrue(boat["cover"].endswith(BoatPhoto.objects.get(pk=first["id"]).image.name))
        mine = self.client.get("/api/boats/mine/").data
        self.assertIsNotNone(mine[0]["cover"])

    def test_change_cover(self):
        first = self.upload().data
        second = self.upload().data
        response = self.client.patch(f"/api/boats/{self.boat.id}/photos/{second['id']}/", {"is_cover": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(BoatPhoto.objects.get(pk=first["id"]).is_cover)
        self.assertTrue(BoatPhoto.objects.get(pk=second["id"]).is_cover)

    def test_deleting_cover_promotes_another_photo(self):
        first = self.upload().data
        second = self.upload().data
        self.client.delete(f"/api/boats/{self.boat.id}/photos/{first['id']}/")
        self.assertTrue(BoatPhoto.objects.get(pk=second["id"]).is_cover)

    def test_only_owner_uploads_or_deletes(self):
        photo = self.upload().data
        CrewMember.objects.create(boat=self.boat, user=self.other)
        self.client.force_authenticate(self.other)  # ni siquiera un tripulante
        self.assertEqual(self.upload().status_code, 403)
        self.assertEqual(self.client.delete(f"/api/boats/{self.boat.id}/photos/{photo['id']}/").status_code, 403)

    def test_deleting_boat_removes_files(self):
        self.upload()
        name = BoatPhoto.objects.get().image.name
        self.client.delete(f"/api/boats/{self.boat.id}/")
        self.assertFalse((Path(MEDIA) / name).exists())


class CronTests(TestCase):
    URL = "/api/cron/event-reminders/"

    @override_settings(CRON_SECRET="s3cret")
    def test_needs_the_vercel_secret(self):
        self.assertEqual(self.client.get(self.URL).status_code, 401)
        self.assertEqual(self.client.get(self.URL, HTTP_AUTHORIZATION="Bearer otro").status_code, 401)
        response = self.client.get(self.URL, HTTP_AUTHORIZATION="Bearer s3cret")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Recordatorios", response.json()["result"])

    @override_settings(CRON_SECRET="")
    def test_disabled_without_secret(self):
        self.assertEqual(self.client.get(self.URL, HTTP_AUTHORIZATION="Bearer ").status_code, 401)
