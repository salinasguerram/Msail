from django.urls import path

from . import views

app_name = "profiles"

urlpatterns = [
    path("me/", views.MyProfileView.as_view(), name="me"),
    path("me/avatar/", views.MyAvatarView.as_view(), name="my-avatar"),
    path("me/photos/", views.MyPhotosView.as_view(), name="my-photos"),
    path("me/photos/<int:pk>/", views.MyPhotoDetailView.as_view(), name="my-photo"),
    path("me/results/", views.MyResultsView.as_view(), name="my-results"),
    path("me/results/<int:pk>/", views.MyResultDetailView.as_view(), name="my-result"),
    path("lookup/", views.SailorLookupView.as_view(), name="lookup"),
    path("results/<int:pk>/", views.ResultDetailView.as_view(), name="result"),
    path("<int:user_id>/", views.PublicProfileView.as_view(), name="public"),
]
