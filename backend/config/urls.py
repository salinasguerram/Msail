from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.core import cron
from apps.sailing.views import BoatClassListView, ClubListView, CountryListView, RegionListView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/profiles/", include("apps.profiles.urls")),
    path("api/boats/", include("apps.boats.urls")),
    path("api/events/", include("apps.events.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/news/", include("apps.news.urls")),
    path("api/marinas/", include("apps.marinas.urls")),
    path("api/professionals/", include("apps.professionals.urls")),
    path("api/weather/", include("apps.weather.urls")),
    path("api/map/", include("apps.map.urls")),
    path("api/msailing/", include("apps.msailing.urls")),
    path("api/premium/", include("apps.premium.urls")),
    path("api/legal/", include("apps.legal.urls")),
    path("api/cron/event-reminders/", cron.event_reminders, name="cron-event-reminders"),
    path("api/boat-classes/", BoatClassListView.as_view(), name="boat-classes"),
    path("api/countries/", CountryListView.as_view(), name="countries"),
    path("api/regions/", RegionListView.as_view(), name="regions"),
    path("api/clubs/", ClubListView.as_view(), name="clubs"),
]

# En local Django sirve las fotos; en producción las sirve Supabase Storage.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
