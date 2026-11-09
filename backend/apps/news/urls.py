from django.urls import path

from . import views

app_name = "news"

urlpatterns = [
    path("", views.ArticleListView.as_view(), name="list"),
    path("front/", views.FrontPageView.as_view(), name="front"),
    path("filters/", views.FilterOptionsView.as_view(), name="filters"),
    path("<slug:slug>/", views.ArticleDetailView.as_view(), name="detail"),
]
