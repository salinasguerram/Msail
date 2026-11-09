from django.urls import path

from . import views

app_name = "professionals"

urlpatterns = [
    path("", views.ProfessionalListView.as_view(), name="list"),
    path("filters/", views.ProfessionalFilterOptionsView.as_view(), name="filters"),
    path("<slug:slug>/", views.ProfessionalDetailView.as_view(), name="detail"),
]
