import shutil
import tempfile
from datetime import timedelta
from io import BytesIO, StringIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from .models import Article, Highlight

MEDIA = tempfile.mkdtemp(prefix="msail-test-news-")


def article(slug, hours_ago=1, **extra):
    data = {
        "title": slug.replace("-", " ").title(),
        "slug": slug,
        "summary": "Resumen",
        "body": "Primer párrafo.\n\nSegundo párrafo.",
        "published_at": timezone.now() - timedelta(hours=hours_ago),
    }
    data.update(extra)
    return Article.objects.create(**data)


class FrontPageTests(APITestCase):
    def front(self):
        return self.client.get("/api/news/front/").data

    def test_day_week_and_latest(self):
        article("vieja", hours_ago=24 * 20)
        article("normal", hours_ago=2)
        article("leida", hours_ago=30, views=50)
        article("destacada-semana", hours_ago=24 * 5, highlight=Highlight.WEEK)
        article("portada", hours_ago=10, highlight=Highlight.DAY)
        data = self.front()
        self.assertEqual(data["day"]["slug"], "portada")
        # Primero las marcadas "de la semana", después las más leídas.
        self.assertEqual([a["slug"] for a in data["week"]], ["destacada-semana", "leida", "normal"])
        self.assertEqual([a["slug"] for a in data["latest"]], ["vieja"])

    def test_day_falls_back_to_latest_when_no_fresh_cover(self):
        article("portada-vieja", hours_ago=48, highlight=Highlight.DAY)
        article("nueva", hours_ago=1)
        self.assertEqual(self.front()["day"]["slug"], "nueva")

    def test_drafts_and_scheduled_are_hidden(self):
        article("borrador", is_published=False)
        article("programada", hours_ago=-5)
        self.assertIsNone(self.front()["day"])
        self.assertEqual(self.client.get("/api/news/").data["count"], 0)
        self.assertEqual(self.client.get("/api/news/programada/").status_code, 404)

    def test_empty(self):
        self.assertEqual(self.front(), {"day": None, "week": [], "latest": []})


class ArticleDetailTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())

    def test_detail_counts_views_and_splits_paragraphs(self):
        item = article("nota")
        data = self.client.get("/api/news/nota/").data
        self.assertEqual(data["paragraphs"], ["Primer párrafo.", "Segundo párrafo."])
        self.client.get("/api/news/nota/")
        item.refresh_from_db()
        self.assertEqual(item.views, 2)

    def test_related_by_event_then_country(self):
        from apps.events.models import Event, EventType
        from apps.geo.models import Country

        es = Country.objects.get(iso_code="ES")
        event = Event.objects.create(name="Copa", slug="copa", event_type=EventType.INSHORE, start_date=timezone.localdate(), country=es)
        main = article("principal", country=es, event=event)
        article("misma-regata", event=event)
        article("mismo-pais", country=es)
        article("otra")
        data = self.client.get(f"/api/news/{main.slug}/").data
        self.assertEqual([a["slug"] for a in data["related"]], ["misma-regata", "mismo-pais"])
        self.assertEqual(data["event"], {"slug": "copa", "name": "Copa"})


@override_settings(MEDIA_ROOT=MEDIA)
class CoverAndAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser(email="admin@msail.com", password="x-segura-123")

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.client.force_login(self.admin)

    def test_create_from_panel_with_cover_and_set_day(self):
        buffer = BytesIO()
        Image.new("RGB", (3000, 2000), (10, 80, 160)).save(buffer, "JPEG")
        response = self.client.post(
            reverse("admin:news_article_add"),
            {
                "title": "Nota con foto",
                "slug": "nota-con-foto",
                "summary": "Bajada",
                "body": "Texto",
                "cover": SimpleUploadedFile("foto.jpg", buffer.getvalue(), content_type="image/jpeg"),
                "is_published": "on",
                "published_at_0": timezone.localdate().isoformat(),
                "published_at_1": "00:00:00",
                "highlight": "",
                "author": "Redacción MSAIL",
            },
            follow=True,
        )
        self.assertEqual(response.status_code, 200)
        item = Article.objects.get(slug="nota-con-foto")
        with Image.open(item.cover.path) as big, Image.open(item.cover_thumb.path) as thumb:
            self.assertEqual(max(big.size), 1600)
            self.assertEqual(max(thumb.size), Article.COVER_THUMB_SIDE)

        other = article("otra")
        self.client.post(
            reverse("admin:news_article_changelist"),
            {"action": "make_day", "_selected_action": [str(other.pk)]},
        )
        other.refresh_from_db()
        self.assertEqual(other.highlight, Highlight.DAY)

    def test_seed_news_is_idempotent(self):
        call_command("seed_base", stdout=StringIO())
        call_command("seed_news", stdout=StringIO())
        first = dict(Article.objects.values_list("slug", "published_at"))
        call_command("seed_news", stdout=StringIO())
        self.assertEqual(dict(Article.objects.values_list("slug", "published_at")), first)
        self.assertTrue(all(Article.objects.values_list("title", flat=True)))


class FilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        from apps.events.models import Event, EventType
        from apps.geo.models import Country
        from apps.sailing.models import BoatClass

        cls.es = Country.objects.get(iso_code="ES")
        cls.cl = Country.objects.get(iso_code="CL")
        cls.event = Event.objects.create(
            name="Copa del Rey", slug="copa-del-rey", event_type=EventType.INSHORE, start_date=timezone.localdate(), country=cls.es
        )
        a = article("nola-gana", country=cls.es, event=cls.event, body="Nola ganó en la bahía de Palma.")
        a.boat_classes.set([BoatClass.objects.get(slug="orc")])
        b = article("tensacon-gana", country=cls.cl, body="Tensacon ganó en Valparaíso.")
        b.boat_classes.set([BoatClass.objects.get(slug="irc")])
        article("borrador-es", country=cls.es, is_published=False)

    def slugs(self, query):
        return [a["slug"] for a in self.client.get(f"/api/news/{query}").data["results"]]

    def test_filters_combine(self):
        self.assertEqual(self.slugs("?country=es"), ["nola-gana"])
        self.assertEqual(self.slugs("?class=irc"), ["tensacon-gana"])
        self.assertEqual(self.slugs("?event=copa-del-rey"), ["nola-gana"])
        self.assertEqual(self.slugs("?country=CL&class=orc"), [])

    def test_search_ignores_accents_and_includes_classes(self):
        self.assertEqual(self.slugs("?q=valparaiso"), ["tensacon-gana"])
        self.assertEqual(self.slugs("?q=BAHIA nola"), ["nola-gana"])
        self.assertEqual(self.slugs("?q=orc"), ["nola-gana"])  # la clase se suma al texto de búsqueda

    def test_filter_options_only_list_what_has_news(self):
        data = self.client.get("/api/news/filters/").data
        self.assertEqual([c["value"] for c in data["countries"]], ["CL", "ES"])
        self.assertEqual({c["value"] for c in data["classes"]}, {"irc", "orc"})
        self.assertEqual(data["events"], [{"value": "copa-del-rey", "label": "Copa del Rey", "count": 1}])

    def test_event_page_lists_its_news(self):
        data = self.client.get("/api/events/copa-del-rey/").data
        self.assertEqual(data["news_count"], 1)
        self.assertEqual(data["news"][0]["slug"], "nola-gana")
