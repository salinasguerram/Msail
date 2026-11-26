from django.urls import path

from . import views

app_name = "ranking"

urlpatterns = [
    path("", views.RankingView.as_view(), name="table"),
    path("options/", views.RankingOptionsView.as_view(), name="options"),
]
