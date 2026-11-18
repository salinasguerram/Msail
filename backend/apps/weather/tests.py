from datetime import timedelta
from io import StringIO
from unittest import mock

import requests
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.events.models import Event, EventType
from apps.geo.models import Country, Region

DATES = ["2026-11-10", "2026-11-11"]
WEATHER = {
    "timezone": "Europe/Madrid",
    "daily": {
        "time": DATES,
        "weather_code": [3, 61],
        "temperature_2m_max": [24.4, 20.0],
        "temperature_2m_min": [16.3, 15.0],
        "precipitation_sum": [0.0, 4.2],
        "precipitation_probability_max": [8, 70],
        "wind_speed_10m_max": [9.9, 18.0],
        "wind_gusts_10m_max": [17.5, 30.1],
        "wind_direction_10m_dominant": [66, 233],
    },
}
MARINE = {"daily": {"time": DATES, "wave_height_max": [0.68, None], "wave_direction_dominant": [138, None], "wave_period_max": [4.5, None]}}


def fake_get(weather=WEATHER, marine=MARINE, fail_weather=False, fail_marine=False):
    def _get(url, params=None, timeout=None):
        response = mock.Mock()
        response.raise_for_status = mock.Mock()
        if "marine" in url:
            if fail_marine:
                raise requests.ConnectionError("mar caído")
            response.json.return_value = marine
        else:
            if fail_weather:
                raise requests.Timeout("tiempo caído")
            response.json.return_value = weather
        return response

    return _get


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "weather-tests"}})
class WeatherApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        es = Country.objects.get(iso_code="ES")
        today = timezone.localdate()
        cls.soon = Event.objects.create(
            name="Copa Pronto", slug="copa-pronto", event_type=EventType.INSHORE, start_date=today + timedelta(days=5),
            country=es, city="Palma", venue="Bahía de Palma", latitude=39.555, longitude=2.625,
        )
        Event.objects.create(
            name="Copa Lejana", slug="copa-lejana", event_type=EventType.INSHORE, start_date=today + timedelta(days=200),
            country=es, latitude=39.5, longitude=2.6,
        )
        Event.objects.create(name="Sin coordenadas", slug="sin-coords", event_type=EventType.INSHORE, start_date=today + timedelta(days=3), country=es)
        cls.zone = Region.objects.filter(latitude__isnull=False).first()

    def setUp(self):
        cache.clear()

    def test_places(self):
        data = self.client.get("/api/weather/places/").data
        self.assertEqual([p["id"] for p in data["events"]], ["event:copa-pronto"])  # próximas y con coordenadas
        self.assertEqual(data["events"][0]["name"], "Bahía de Palma")
        self.assertEqual(len(data["zones"]), Region.objects.filter(latitude__isnull=False).count())

    def test_forecast_merges_weather_and_waves(self):
        with mock.patch("apps.weather.services.requests.get", side_effect=fake_get()) as get:
            data = self.client.get("/api/weather/forecast/", {"place": "event:copa-pronto"}).data
        self.assertEqual(data["place"]["subtitle"], "Copa Pronto")
        first, second = data["days"]
        self.assertEqual((first["wind_kn"], first["gusts_kn"], first["wind_direction"], first["wave_m"]), (9.9, 17.5, 66, 0.68))
        self.assertIsNone(second["wave_m"])
        self.assertTrue(data["has_waves"])
        self.assertEqual(data["source"]["name"], "Open-Meteo")
        params = get.call_args_list[0].kwargs["params"]
        self.assertEqual((params["wind_speed_unit"], params["forecast_days"]), ("kn", 7))

    def test_cached_for_an_hour(self):
        with mock.patch("apps.weather.services.requests.get", side_effect=fake_get()) as get:
            self.client.get("/api/weather/forecast/", {"place": f"zone:{self.zone.pk}"})
            self.client.get("/api/weather/forecast/", {"place": f"zone:{self.zone.pk}"})
        self.assertEqual(get.call_count, 2)  # tiempo + mar, una sola vez

    def test_marine_failure_still_returns_weather(self):
        with mock.patch("apps.weather.services.requests.get", side_effect=fake_get(fail_marine=True)):
            data = self.client.get("/api/weather/forecast/", {"place": "event:copa-pronto"}).data
        self.assertFalse(data["has_waves"])
        self.assertEqual(data["days"][1]["rain_mm"], 4.2)

    def test_weather_failure_is_503(self):
        with mock.patch("apps.weather.services.requests.get", side_effect=fake_get(fail_weather=True)):
            response = self.client.get("/api/weather/forecast/", {"place": "event:copa-pronto"})
        self.assertEqual(response.status_code, 503)

    def test_here_rounds_to_grid_and_names_nearest_zone(self):
        zone = self.zone
        weather = {**WEATHER, "current": {"temperature_2m": 21.4, "weather_code": 2, "wind_speed_10m": 11.2, "wind_gusts_10m": 18.4, "wind_direction_10m": 200, "is_day": 1}}
        with mock.patch("apps.weather.services.requests.get", side_effect=fake_get(weather=weather)) as get:
            lat, lng = float(zone.latitude) + 0.06, float(zone.longitude) - 0.04
            response = self.client.get("/api/weather/forecast/", {"place": f"here:{lat},{lng}"})
        self.assertEqual(response.status_code, 200)
        place = response.data["place"]
        self.assertEqual(place["kind"], "here")
        # Redondeado a la grilla de 0,25°: Open-Meteo recibe esas coordenadas, no las exactas.
        self.assertEqual(place["latitude"] % 0.25, 0)
        self.assertEqual(get.call_args_list[0].kwargs["params"]["latitude"], place["latitude"])
        self.assertIn(zone.name, place["subtitle"])
        self.assertEqual(response.data["current"]["temp"], 21.4)
        self.assertEqual(response.data["current"]["wind_kn"], 11.2)
        self.assertEqual(response.data["current"]["gusts_kn"], 18.4)

    def test_here_rejects_bad_coordinates(self):
        for bad in ("here:", "here:abc,def", "here:95,10", "here:10,200", "here:nan,1"):
            self.assertEqual(self.client.get("/api/weather/forecast/", {"place": bad}).status_code, 404, bad)

    def test_only_known_places(self):
        with mock.patch("apps.weather.services.requests.get") as get:
            for place in ["", "zone:9999", "event:no-existe", "lat:39.5", "event:sin-coords"]:
                self.assertEqual(self.client.get("/api/weather/forecast/", {"place": place}).status_code, 404, place)
        get.assert_not_called()

    def test_far_event_still_has_forecast_by_link(self):
        # Desde la página de una regata lejana también se puede consultar (aunque no figure en la lista).
        with mock.patch("apps.weather.services.requests.get", side_effect=fake_get()):
            self.assertEqual(self.client.get("/api/weather/forecast/", {"place": "event:copa-lejana"}).status_code, 200)


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "wind-tests"}})
class WindGridTests(APITestCase):
    def setUp(self):
        cache.clear()

    def fake_grid(self, count=None):
        from apps.weather.services import wind_grid_coords

        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        times = [(now + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00") for h in range(-2, 60)]
        speeds = [float(i) for i in range(len(times))]  # el valor dice qué hora es (índice)
        cells = [{"hourly": {"time": times, "wind_speed_10m": speeds, "wind_direction_10m": [90] * len(times)}}]
        return cells * (count if count is not None else len(wind_grid_coords()))

    def test_grid_picks_now_and_later_hours(self):
        response = mock.Mock(raise_for_status=mock.Mock(), json=mock.Mock(return_value=self.fake_grid()))
        with mock.patch("apps.weather.services.requests.get", return_value=response) as get:
            data = self.client.get("/api/weather/wind/").data
            self.client.get("/api/weather/wind/")  # segunda vez: de la caché
        self.assertEqual(get.call_count, 1)
        self.assertEqual(len(data["points"]), 240)
        self.assertEqual(data["offsets"], [0, 12, 24, 48])
        # La lista empieza 2 h antes de ahora: ahora=2, +12=14, +24=26, +48=50.
        self.assertEqual(data["points"][0]["speed"], [2.0, 14.0, 26.0, 50.0])
        self.assertEqual(data["points"][0]["direction"], [90, 90, 90, 90])
        params = get.call_args.kwargs["params"]
        self.assertEqual(len(params["latitude"].split(",")), 240)
        self.assertEqual(params["wind_speed_unit"], "kn")

    def test_failure_is_503(self):
        with mock.patch("apps.weather.services.requests.get", side_effect=requests.Timeout("caído")):
            self.assertEqual(self.client.get("/api/weather/wind/").status_code, 503)
        bad = mock.Mock(raise_for_status=mock.Mock(), json=mock.Mock(return_value=self.fake_grid(count=3)))
        with mock.patch("apps.weather.services.requests.get", return_value=bad):
            self.assertEqual(self.client.get("/api/weather/wind/").status_code, 503)


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "area-tests"}})
class AreaApiTests(APITestCase):
    """Clima marino de una zona: grilla de 15 x 15 puntos, cada 3 h, con viento, olas y corrientes."""

    def setUp(self):
        cache.clear()

    def fake(self, marine_down=False):
        hours = list(range(1_800_000_000, 1_800_000_000 + 24 * 3600, 3600))

        def _get(url, params=None, timeout=None):
            count = len(params["latitude"].split(","))
            response = mock.Mock()
            response.raise_for_status = mock.Mock()
            if "marine" in url:
                if marine_down:
                    raise requests.ConnectionError("mar caído")
                hourly = {"time": hours, "wave_height": [1.2] * 24, "wave_direction": [180] * 24,
                          "ocean_current_velocity": [1.852] * 24, "ocean_current_direction": [90] * 24}
            else:
                hourly = {"time": hours, "wind_speed_10m": list(range(24)), "wind_direction_10m": [225] * 24, "wind_gusts_10m": [18] * 24}
            response.json.return_value = [{"utc_offset_seconds": -10800, "hourly": hourly} for _ in range(count)]
            return response

        return _get

    def test_grid_every_three_hours_in_knots(self):
        with mock.patch("apps.weather.services.requests.get", side_effect=self.fake()) as get:
            response = self.client.get("/api/weather/area/", {"place": "here:-34.6,-58.4"})
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(len(data["points"]), 225)
        self.assertEqual(data["step"], 0.5)
        self.assertEqual(len(data["times"]), 8)
        self.assertEqual(data["utc_offset_seconds"], -10800)
        center = data["points"][112]  # el del medio
        self.assertEqual((center["lat"], center["lng"]), (data["center"]["lat"], data["center"]["lng"]))
        self.assertEqual(center["wind"][:3], [0, 3, 6])  # una de cada 3 horas
        self.assertEqual(center["current"][0], 1.0)  # 1,852 km/h = 1 nudo
        self.assertTrue(data["has_waves"] and data["has_currents"])
        self.assertEqual(get.call_count, 2)  # un pedido para el tiempo y otro para el mar, con los 225 puntos

    def test_without_marine_data_still_has_wind(self):
        with mock.patch("apps.weather.services.requests.get", side_effect=self.fake(marine_down=True)):
            data = self.client.get("/api/weather/area/", {"place": "here:-34.6,-58.4"}).data
        self.assertFalse(data["has_waves"])
        self.assertIsNone(data["points"][0]["wave"][0])
        self.assertEqual(data["points"][0]["gusts"][0], 18)

    def test_unknown_place_is_404(self):
        self.assertEqual(self.client.get("/api/weather/area/", {"place": "zone:999999"}).status_code, 404)
