from datetime import date
from io import StringIO

from django.core.management import call_command
from django.utils import translation
from rest_framework.test import APITestCase

from .models import FoundationSupport, Section, Video


class MsailingApiTests(APITestCase):
    def test_page_has_sections_videos_and_foundation(self):
        call_command("seed_msailing", stdout=StringIO())
        Video.objects.create(title="Cómo trimar el génova", url="https://www.youtube.com/watch?v=dQw4w9WgXcQ", kind="tip")
        Video.objects.create(title="Borrador", url="https://vimeo.com/1", is_published=False)
        FoundationSupport.objects.create(beneficiary="Ana", purpose="Viaje al Mundial", amount=1500, currency="USD", date=date(2026, 10, 1))
        FoundationSupport.objects.create(beneficiary="Ana", purpose="Velas nuevas", amount=500, currency="USD", date=date(2026, 11, 1))
        FoundationSupport.objects.create(beneficiary="Oculto", purpose="x", amount=99, date=date(2026, 1, 1), is_published=False)

        data = self.client.get("/api/msailing/").data
        self.assertEqual(set(data["sections"]), {"about", "school", "foundation"})
        self.assertEqual(data["sections"]["foundation"]["cta_label"], "Quiero colaborar")
        self.assertEqual([v["title"] for v in data["videos"]], ["Cómo trimar el génova"])
        self.assertEqual(data["videos"][0]["thumbnail"], "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
        self.assertEqual([s["purpose"] for s in data["foundation"]["supports"]], ["Velas nuevas", "Viaje al Mundial"])
        self.assertEqual(data["foundation"]["totals"], [{"currency": "USD", "total": 2000.0}])
        self.assertEqual(data["foundation"]["athletes"], 1)

    def test_english_texts_with_spanish_fallback(self):
        Section.objects.create(key="about", title_es="Quiénes somos", title_en="About us", body_es="Hola", body_en="")
        with translation.override("en"):
            about = self.client.get("/api/msailing/", HTTP_ACCEPT_LANGUAGE="en").data["sections"]["about"]
        self.assertEqual(about["title"], "About us")
        self.assertEqual(about["body"], "Hola")  # sin texto en inglés, va el español

    def test_seed_does_not_overwrite_edits(self):
        call_command("seed_msailing", stdout=StringIO())
        Section.objects.filter(key="about").update(title_es="Nosotros")
        call_command("seed_msailing", stdout=StringIO())
        self.assertEqual(Section.objects.get(key="about").title_es, "Nosotros")
