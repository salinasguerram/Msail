import shutil
import tempfile
from datetime import timedelta
from io import BytesIO, StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from apps.geo.models import Country

from .models import Event, EventMedia, EventType, MediaKind, parse_video_url

MEDIA = tempfile.mkdtemp(prefix="msail-test-gallery-")


def photo(name="foto.jpg", size=(2400, 1600), fmt="JPEG"):
    buffer = BytesIO()
    image = Image.new("RGB", size, (30, 120, 200))
    exif = Image.Exif()
    exif[0x8825] = {2: (34.0, 0.0, 0.0)}  # GPS
    image.save(buffer, format=fmt, exif=exif) if fmt == "JPEG" else image.save(buffer, format=fmt)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=f"image/{fmt.lower()}")


class GalleryBase:
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.event = Event.objects.create(
            name="Copa Galería", slug="copa-galeria", event_type=EventType.INSHORE,
            start_date=timezone.localdate() - timedelta(days=5), country=Country.objects.get(iso_code="ES"),
        )

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)


class VideoUrlTests(TestCase):
    def test_parses_youtube_and_vimeo_links(self):
        self.assertEqual(parse_video_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), ("youtube", "dQw4w9WgXcQ"))
        self.assertEqual(parse_video_url("https://youtu.be/dQw4w9WgXcQ"), ("youtube", "dQw4w9WgXcQ"))
        self.assertEqual(parse_video_url("https://youtube.com/shorts/dQw4w9WgXcQ"), ("youtube", "dQw4w9WgXcQ"))
        self.assertEqual(parse_video_url("https://vimeo.com/123456789"), ("vimeo", "123456789"))
        self.assertEqual(parse_video_url("https://example.com/video.mp4"), (None, None))


@override_settings(MEDIA_ROOT=MEDIA)
class MediaModelTests(GalleryBase, TestCase):
    def test_photo_is_resized_stripped_and_gets_square_thumbnail(self):
        media = EventMedia(event=self.event, image=photo())
        media.full_clean()
        media.save()
        with Image.open(media.image.path) as big:
            self.assertEqual(max(big.size), 1600)
            self.assertNotIn(0x8825, big.getexif())
        with Image.open(media.thumbnail.path) as thumb:
            self.assertEqual(thumb.size, (EventMedia.THUMB_SIDE, EventMedia.THUMB_SIDE))

    def test_deleting_removes_both_files(self):
        media = EventMedia(event=self.event, image=photo())
        media.save()
        paths = [Path(media.image.path), Path(media.thumbnail.path)]
        media.delete()
        self.assertFalse(any(p.exists() for p in paths))

    def test_validation(self):
        with self.assertRaises(ValidationError):
            EventMedia(event=self.event, kind=MediaKind.PHOTO).full_clean()
        with self.assertRaises(ValidationError):
            EventMedia(event=self.event, kind=MediaKind.VIDEO, video_url="https://example.com/v.mp4").full_clean()
        with self.assertRaises(ValidationError):
            fake = SimpleUploadedFile("x.jpg", b"no soy una imagen", content_type="image/jpeg")
            EventMedia(event=self.event, image=fake).full_clean()
        EventMedia(event=self.event, kind=MediaKind.VIDEO, video_url="https://youtu.be/dQw4w9WgXcQ").full_clean()


@override_settings(MEDIA_ROOT=MEDIA)
class GalleryApiTests(GalleryBase, APITestCase):
    def test_detail_preview_and_paginated_gallery(self):
        for i in range(11):
            EventMedia.objects.create(event=self.event, image=photo(size=(300, 200)), order=i, credit="© Test")
        EventMedia.objects.create(event=self.event, kind=MediaKind.VIDEO, video_url="https://youtu.be/dQw4w9WgXcQ", order=99)

        data = self.client.get("/api/events/copa-galeria/").data
        self.assertEqual(data["media_count"], 12)
        self.assertEqual(len(data["media_preview"]), 9)
        first = data["media_preview"][0]
        self.assertTrue(first["thumbnail"].startswith("http://testserver/media/event_media/thumbs/"))
        self.assertEqual(first["credit"], "© Test")

        page = self.client.get("/api/events/copa-galeria/media/").data
        self.assertEqual(page["count"], 12)
        video = page["results"][-1]
        self.assertEqual(video["video"], {"provider": "youtube", "id": "dQw4w9WgXcQ", "url": "https://youtu.be/dQw4w9WgXcQ"})
        self.assertEqual(video["thumbnail"], "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg")

    def test_unpublished_event_gallery_is_hidden(self):
        Event.objects.filter(pk=self.event.pk).update(is_published=False)
        self.assertEqual(self.client.get("/api/events/copa-galeria/media/").status_code, 404)


@override_settings(MEDIA_ROOT=MEDIA)
class GalleryAdminTests(GalleryBase, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.admin = get_user_model().objects.create_superuser(email="admin@msail.com", password="x-segura-123")

    def setUp(self):
        self.client.force_login(self.admin)
        self.url = reverse("admin:events_event_upload_photos_action", args=[self.event.pk])

    def test_upload_several_photos_at_once(self):
        self.assertContains(self.client.get(reverse("admin:events_event_change", args=[self.event.pk])), "Subir fotos")
        response = self.client.post(
            self.url,
            {"photos": [photo("a.jpg"), photo("b.png", fmt="PNG")], "credit": "© Fotógrafo"},
            follow=True,
        )
        self.assertContains(response, "Se subieron 2 foto(s)")
        self.assertEqual(list(self.event.media.values_list("credit", flat=True)), ["© Fotógrafo"] * 2)
        self.assertEqual(sorted(self.event.media.values_list("order", flat=True)), [1, 2])

    def test_bad_files_are_reported_and_good_ones_kept(self):
        fake = SimpleUploadedFile("virus.jpg", b"MZ no es foto", content_type="image/jpeg")
        response = self.client.post(self.url, {"photos": [photo("ok.jpg"), fake]})
        self.assertContains(response, "virus.jpg")
        self.assertEqual(self.event.media.count(), 1)
