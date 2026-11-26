import shutil
import tempfile
from datetime import timedelta
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.geo.models import Country

from .models import DocumentKind, Event, EventCategory, EventDocument, EventType

MEDIA = tempfile.mkdtemp(prefix="msail-test-docs-")
PDF = b"%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF"


def days(n):
    return timezone.localdate() + timedelta(days=n)


def pdf_upload(name="aviso.pdf", content=PDF):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


@override_settings(MEDIA_ROOT=MEDIA)
class DocumentTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.es = Country.objects.get(iso_code="ES")

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def event(self, **extra):
        data = {"name": "Regata", "slug": "regata", "event_type": EventType.INSHORE, "start_date": days(30), "country": self.es}
        data.update(extra)
        return Event.objects.create(**data)


class DocumentValidationTests(DocumentTestCase):
    def test_needs_exactly_one_of_file_or_link(self):
        event = self.event()
        with self.assertRaises(ValidationError):
            EventDocument(event=event, title="Vacío").clean()
        with self.assertRaises(ValidationError):
            EventDocument(event=event, title="Ambos", url="https://x.org/a.pdf", file=pdf_upload()).clean()
        EventDocument(event=event, title="Link", url="https://x.org/a.pdf").clean()
        EventDocument(event=event, title="PDF", file=pdf_upload()).clean()

    def test_rejects_files_that_are_not_pdf(self):
        fake = SimpleUploadedFile("virus.pdf", b"MZ esto no es un pdf", content_type="application/pdf")
        with self.assertRaises(ValidationError):
            EventDocument(event=self.event(), title="Falso", file=fake).clean()

    def test_rejects_too_large_pdf(self):
        from . import models

        original = models.PDF_MAX_MB
        models.PDF_MAX_MB = 0.00001
        try:
            with self.assertRaises(ValidationError):
                EventDocument(event=self.event(), title="Grande", file=pdf_upload()).clean()
        finally:
            models.PDF_MAX_MB = original

    def test_deleting_document_removes_file(self):
        doc = EventDocument.objects.create(event=self.event(), title="PDF", file=pdf_upload())
        path = Path(MEDIA) / doc.file.name
        self.assertTrue(path.exists())
        doc.delete()
        self.assertFalse(path.exists())


class DocumentApiTests(DocumentTestCase):
    def test_detail_lists_uploaded_pdf_and_external_link(self):
        event = self.event()
        EventDocument.objects.create(event=event, title="Aviso de regata", kind=DocumentKind.NOTICE_OF_RACE, file=pdf_upload(), order=0)
        EventDocument.objects.create(event=event, title="Instrucciones", kind=DocumentKind.SAILING_INSTRUCTIONS, url="https://club.org/si.pdf", order=1)
        docs = self.client.get(f"/api/events/{event.slug}/").data["documents"]
        self.assertEqual([d["title"] for d in docs], ["Aviso de regata", "Instrucciones"])
        self.assertEqual(docs[0]["source"], "file")
        self.assertTrue(docs[0]["url"].startswith("http://testserver/media/event_documents/"))
        self.assertIsNotNone(docs[0]["size_kb"])
        self.assertEqual(docs[1]["source"], "link")
        self.assertEqual(docs[1]["url"], "https://club.org/si.pdf")


class EntriesTests(DocumentTestCase):
    def test_entries_open_until_deadline_or_start(self):
        self.assertFalse(self.event().entries_open)  # sin link
        open_event = self.event(slug="a", entry_url="https://inscripcion.org", entry_deadline=days(5))
        self.assertTrue(open_event.entries_open)
        closed = self.event(slug="b", entry_url="https://inscripcion.org", entry_deadline=days(-1))
        self.assertFalse(closed.entries_open)
        no_deadline = self.event(slug="c", entry_url="https://inscripcion.org")
        self.assertTrue(no_deadline.entries_open)  # hasta el inicio
        started = self.event(slug="d", entry_url="https://inscripcion.org", start_date=days(-2), end_date=days(2))
        self.assertFalse(started.entries_open)

    def test_api_exposes_entry_status(self):
        event = self.event(entry_url="https://inscripcion.org", entry_deadline=days(5))
        data = self.client.get(f"/api/events/{event.slug}/").data
        self.assertTrue(data["entries_open"])
        self.assertEqual(data["entry_deadline"], days(5).isoformat())


@override_settings(MEDIA_ROOT=MEDIA)
class EventAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.admin = get_user_model().objects.create_superuser(email="admin@msail.com", password="x-segura-123")
        cls.es = Country.objects.get(iso_code="ES")
        cls.past = Event.objects.create(
            name="Copa Test 2026", slug="copa-test-2026", event_type=EventType.INSHORE,
            start_date=days(-60), end_date=days(-55), country=cls.es,
        )
        EventCategory.objects.create(event=cls.past, name="ORC A")
        cls.next = Event.objects.create(
            name="Regata Próxima", slug="regata-proxima", event_type=EventType.OFFSHORE, start_date=days(20), country=cls.es,
        )

    def setUp(self):
        self.client.force_login(self.admin)

    def action(self, name, *events):
        return self.client.post(
            reverse("admin:events_event_changelist"),
            {"action": name, "_selected_action": [str(e.pk) for e in events]},
            follow=True,
        )

    def test_changelist_with_status_filter(self):
        url = reverse("admin:events_event_changelist")
        self.assertContains(self.client.get(url), "Próxima")
        response = self.client.get(url, {"estado": "finished"})
        self.assertContains(response, "Copa Test 2026")
        self.assertNotContains(response, "Regata Próxima")

    def test_change_form_shows_app_link(self):
        response = self.client.get(reverse("admin:events_event_change", args=[self.next.pk]))
        self.assertContains(response, "/events/regata-proxima")

    def test_publish_and_unpublish(self):
        self.action("unpublish", self.next)
        self.next.refresh_from_db()
        self.assertFalse(self.next.is_published)
        self.action("publish", self.next)
        self.next.refresh_from_db()
        self.assertTrue(self.next.is_published)

    def test_duplicate_next_year_copies_categories_unpublished(self):
        self.action("duplicate_next_year", self.past)
        year = self.past.start_date.year
        copy = Event.objects.get(slug=f"copa-test-{year + 1}")
        self.assertEqual(copy.start_date.year, year + 1)
        self.assertFalse(copy.is_published)
        self.assertEqual(list(copy.categories.values_list("name", flat=True)), ["ORC A"])
        # Duplicar de nuevo no crea otra copia
        self.action("duplicate_next_year", self.past)
        self.assertEqual(Event.objects.filter(slug=f"copa-test-{year + 1}").count(), 1)

    def form_data(self, **overrides):
        data = {
            "name": "Nueva Regata",
            "slug": "nueva-regata",
            "event_type": EventType.ONE_DESIGN,
            "is_published": "on",
            "start_date": days(40).isoformat(),
            "end_date": days(42).isoformat(),
            "country": self.es.pk,
            "city": "Palma",
            "organizer_name": "Club Test",
            "ranking_level": "national",
            "counts_for_ranking": "on",
            "categories-TOTAL_FORMS": "1",
            "categories-INITIAL_FORMS": "0",
            "categories-0-order": "0",
            "categories-0-name": "Absoluta",
            "categories-0-division": "open",
            "documents-TOTAL_FORMS": "1",
            "documents-INITIAL_FORMS": "0",
            "documents-0-order": "0",
            "documents-0-title": "Aviso de regata",
            "documents-0-kind": DocumentKind.NOTICE_OF_RACE,
            "documents-0-file": pdf_upload(),
            # Secciones de clasificación y galería, vacías.
            "results-TOTAL_FORMS": "0",
            "results-INITIAL_FORMS": "0",
            "media-TOTAL_FORMS": "0",
            "media-INITIAL_FORMS": "0",
        }
        data.update(overrides)
        return data

    def test_create_event_with_category_and_pdf_from_panel(self):
        response = self.client.post(reverse("admin:events_event_add"), self.form_data(), follow=True)
        self.assertEqual(response.status_code, 200)
        event = Event.objects.get(slug="nueva-regata")
        self.assertEqual(event.categories.get().name, "Absoluta")
        self.assertTrue(event.documents.get().file.name.endswith(".pdf"))
        self.assertIn("palma", event.search_text)

    def test_panel_rejects_end_before_start_and_fake_pdf(self):
        url = reverse("admin:events_event_add")
        bad_dates = self.client.post(url, self.form_data(end_date=days(10).isoformat()))
        self.assertContains(bad_dates, "La fecha de fin no puede ser anterior al inicio")
        fake = SimpleUploadedFile("x.pdf", b"no soy pdf", content_type="application/pdf")
        bad_pdf = self.client.post(url, self.form_data(**{"documents-0-file": fake}))
        self.assertContains(bad_pdf, "El archivo no es un PDF")
        self.assertFalse(Event.objects.filter(slug="nueva-regata").exists())
