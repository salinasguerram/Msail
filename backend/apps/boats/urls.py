from django.urls import path

from . import views

app_name = "boats"

urlpatterns = [
    path("mine/", views.MyBoatsView.as_view(), name="mine"),
    path("<int:pk>/", views.BoatDetailView.as_view(), name="detail"),
    path("<int:boat_id>/photos/", views.BoatPhotosView.as_view(), name="photos"),
    path("<int:boat_id>/photos/<int:pk>/", views.BoatPhotoDetailView.as_view(), name="photo"),
    path("<int:boat_id>/crew/", views.CrewView.as_view(), name="crew"),
    path("<int:boat_id>/crew/<int:pk>/", views.CrewMemberView.as_view(), name="crew-member"),
]
