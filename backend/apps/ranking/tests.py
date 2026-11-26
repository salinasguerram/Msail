from datetime import date, timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APITestCase

from apps.events.models import Event, EventCategory, EventResult
from apps.geo.models import Country
from apps.sailing.models import BoatClass

from .models import RankingConfig

User = get_user_model()
TODAY = date.today()


class RankingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.ar = Country.objects.get(iso_code="AR")
        cls.br = Country.objects.get(iso_code="BR")
        cls.ilca, _ = BoatClass.objects.get_or_create(slug="ilca-7", defaults={"name": "ILCA 7", "category": "dinghy"})

    def setUp(self):
        cache.clear()
        self.n = 0

    def regatta(self, ends, sailors, level="national", fleet=None, division="open", partial_fleet=None, name=None):
        """Regata de ILCA 7 terminada en `ends` con los `sailors` (vela, país) en ese orden."""
        self.n += 1
        event = Event.objects.create(
            name=name or f"Regata {self.n}", slug=f"regata-{self.n}", event_type="one_design", start_date=ends - timedelta(days=2),
            end_date=ends, country=self.ar, ranking_level=level,
        )
        event.boat_classes.add(self.ilca)
        category = EventCategory.objects.create(event=event, name="Sub-17" if division != "open" else "General", boat_class=self.ilca, division=division, fleet_size=partial_fleet)
        for i, (sail, country) in enumerate(sailors, start=1):
            EventResult.objects.create(event=event, category=category, position=i, boat_name=f"Barco {sail}", sail_number=sail, skipper=f"Navegante {sail}", country=country)
        # el resto de la flota (si se pide una flota más grande), sin puesto relevante
        for j in range(len(sailors) + 1, (fleet or 0) + 1):
            EventResult.objects.create(event=event, category=category, position=j, boat_name=f"Otro {j}", sail_number=f"X{self.n}-{j}", country=self.br)
        return event

    def table(self, **params):
        params = {"season": TODAY.year, "class": "ilca-7", **params}
        return self.client.get("/api/ranking/", params).data["entries"]

    def test_points_by_position_fleet_and_level(self):
        last_month = TODAY - timedelta(days=40)
        self.regatta(last_month, [("ARG 1", self.ar), ("ARG 2", self.ar)], fleet=10)  # nacional ×1.5
        self.regatta(TODAY - timedelta(days=1), [("ARG 2", self.ar), ("ARG 1", self.ar)], fleet=5, level="world")  # mundial ×3
        table = self.table()
        top = {e["sail_number"]: e for e in table}
        # ARG 1: 1º de 10 nacional = 100×1.5 = 150 ; 2º de 5 mundial = 80×3 = 240 → 390
        self.assertEqual(top["ARG 1"]["points"], 390.0)
        # ARG 2: 2º de 10 = 90×1.5 = 135 ; 1º de 5 mundial = 300 → 435
        self.assertEqual(top["ARG 2"]["points"], 435.0)
        self.assertEqual([e["sail_number"] for e in table[:2]], ["ARG 2", "ARG 1"])
        self.assertEqual(table[0]["rank"], 1)
        # Movimiento: hace 30 días ARG 1 iba primero (solo contaba la primera regata).
        self.assertEqual((top["ARG 2"]["movement"], top["ARG 1"]["movement"]), (1, -1))

    def test_best_of_min_fleet_divisions_and_country(self):
        RankingConfig.objects.filter(pk=RankingConfig.get().pk).update(best_of=2)
        for days in (10, 20, 30):
            self.regatta(TODAY - timedelta(days=days), [("ARG 1", self.ar), ("BRA 9", self.br)], fleet=5)
        self.regatta(TODAY - timedelta(days=5), [("ARG 1", self.ar)], fleet=3)  # flota chica: no suma
        self.regatta(TODAY - timedelta(days=6), [("ARG 5", self.ar)], fleet=6, division="u17")
        arg = next(e for e in self.table() if e["sail_number"] == "ARG 1")
        self.assertEqual(arg["points"], 300.0)  # 2 mejores de 150
        self.assertEqual(arg["events"], 3)
        self.assertEqual(sum(r["counted"] for r in arg["results"]), 2)
        self.assertEqual([e["sail_number"] for e in self.table(division="u17")][:1], ["ARG 5"])
        self.assertTrue(all(e["country"] == "BR" for e in self.table(country="BR")))
        options = self.client.get("/api/ranking/options/", {"season": TODAY.year}).data
        ilca = next(c for c in options["classes"] if c["slug"] == "ilca-7")
        self.assertEqual(ilca["divisions"], ["open", "u17"])
        self.assertIn({"iso": "BR", "name": self.br.name}, options["countries"])

    def test_podium_only_results_need_the_fleet_size(self):
        self.regatta(TODAY - timedelta(days=3), [("ARG 1", self.ar), ("ARG 2", self.ar)])  # sin flota: 2 barcos < 5
        self.assertEqual(self.table(), [])
        self.regatta(TODAY - timedelta(days=2), [("ARG 1", self.ar)], partial_fleet=20)
        self.assertEqual(self.table()[0]["points"], 150.0)  # 1º de 20, nacional

    def test_dnf_and_excluded_regattas_do_not_score(self):
        event = self.regatta(TODAY - timedelta(days=3), [("ARG 1", self.ar)], fleet=5)
        EventResult.objects.create(event=event, category=event.categories.first(), status="dnf", boat_name="Roto", sail_number="ARG 7", country=self.ar)
        roto = next(e for e in self.table() if e["sail_number"] == "ARG 7")
        self.assertEqual(roto["points"], 0)
        Event.objects.filter(pk=event.pk).update(counts_for_ranking=False)
        self.assertEqual(self.table(), [])

    def test_admin_config_page(self):
        root = User.objects.create_superuser(email="root@msail.test", password="clave-segura-123")
        self.client.force_login(root)
        response = self.client.get("/admin/ranking/rankingconfig/", follow=True)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "oeficiente mundial")


class DemoRankingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        for slug, name, category in (("ilca-6", "ILCA 6", "dinghy"), ("optimist", "Optimist", "dinghy"), ("j70", "J/70", "keelboat")):
            BoatClass.objects.get_or_create(slug=slug, defaults={"name": name, "category": category})
        BoatClass.objects.get_or_create(slug="ilca-7", defaults={"name": "ILCA 7", "category": "dinghy"})

    def setUp(self):
        cache.clear()

    def test_demo_regattas_fill_the_ranking_and_can_be_removed(self):
        call_command("seed_demo_ranking", stdout=StringIO())
        self.assertEqual(Event.objects.filter(is_demo=True).count(), 30)
        options = self.client.get("/api/ranking/options/").data
        self.assertTrue(options["has_demo"])
        self.assertEqual(len(options["seasons"]), 2)  # la actual y la anterior
        self.assertEqual({c["slug"] for c in options["classes"]}, {"ilca-7", "ilca-6", "optimist", "j70"})
        ilca6 = next(c for c in options["classes"] if c["slug"] == "ilca-6")
        self.assertEqual(ilca6["divisions"], ["open", "women", "u21"])
        table = self.client.get("/api/ranking/", {"season": options["season"], "class": "ilca-7"}).data["entries"]
        self.assertGreater(len(table), 20)
        # No aparecen en el calendario ni en el mapa, pero su página sí se abre.
        self.assertEqual(self.client.get("/api/events/").data["count"], 0)
        self.assertEqual(self.client.get(f"/api/events/{Event.objects.filter(is_demo=True).first().slug}/").status_code, 200)
        # Volver a correrlo no duplica; --remove las borra todas.
        call_command("seed_demo_ranking", stdout=StringIO())
        self.assertEqual(Event.objects.filter(is_demo=True).count(), 30)
        call_command("seed_demo_ranking", "--remove", stdout=StringIO())
        self.assertFalse(Event.objects.filter(is_demo=True).exists())
        self.assertFalse(EventResult.objects.exists())
        self.assertFalse(self.client.get("/api/ranking/options/").data["has_demo"])
