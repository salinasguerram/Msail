from django.urls import path

from . import views

app_name = "marinas"

urlpatterns = [
    path("", views.MarinaListView.as_view(), name="list"),
    path("filters/", views.MarinaFilterOptionsView.as_view(), name="filters"),
    path("<slug:slug>/", views.MarinaDetailView.as_view(), name="detail"),
]
