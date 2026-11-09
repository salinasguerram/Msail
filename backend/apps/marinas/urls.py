from django.urls import path

from . import views

app_name = "marinas"

urlpatterns = [
    path("", views.MarinaListView.as_view(), name="list"),
    path("filters/", views.MarinaFilterOptionsView.as_view(), name="filters"),
    path("requests/", views.MyBerthRequestsView.as_view(), name="my-requests"),
    path("requests/<int:pk>/cancel/", views.CancelBerthRequestView.as_view(), name="cancel-request"),
    path("<slug:slug>/requests/", views.BerthRequestCreateView.as_view(), name="request"),
    path("<slug:slug>/", views.MarinaDetailView.as_view(), name="detail"),
]
