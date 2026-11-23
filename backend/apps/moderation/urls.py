from django.urls import path

from . import views

app_name = "moderation"

urlpatterns = [
    path("reports/", views.ReportView.as_view(), name="report"),
    path("blocks/", views.BlockListView.as_view(), name="blocks"),
    path("blocks/<int:user_id>/", views.BlockDetailView.as_view(), name="block"),
]
