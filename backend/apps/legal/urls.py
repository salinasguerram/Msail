from django.urls import path

from . import views

app_name = "legal"

urlpatterns = [path("<slug:key>/", views.LegalPageView.as_view(), name="page")]
