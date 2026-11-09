from django.urls import path

from . import views

app_name = "events"

urlpatterns = [
    path("", views.EventListView.as_view(), name="list"),
    path("<slug:slug>/", views.EventDetailView.as_view(), name="detail"),
    path("<slug:slug>/media/", views.EventMediaView.as_view(), name="media"),
    path("<slug:slug>/follow/", views.EventFollowView.as_view(), name="follow"),
]
