from django.urls import path

from . import views

app_name = "map"

urlpatterns = [
    path("points/", views.MapPointsView.as_view(), name="points"),
]
