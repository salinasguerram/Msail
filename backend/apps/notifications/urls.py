from django.urls import path

from . import views

app_name = "notifications"

urlpatterns = [
    path("", views.NotificationListView.as_view(), name="list"),
    path("unread/", views.UnreadCountView.as_view(), name="unread"),
    path("read/", views.MarkReadView.as_view(), name="read-all"),
    path("<int:pk>/read/", views.MarkReadView.as_view(), name="read"),
]
