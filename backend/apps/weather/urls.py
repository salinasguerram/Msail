from django.urls import path

from . import views

app_name = "weather"

urlpatterns = [
    path("places/", views.PlacesView.as_view(), name="places"),
    path("forecast/", views.ForecastView.as_view(), name="forecast"),
]
