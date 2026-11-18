from django.urls import path

from . import views

app_name = "msailing"

urlpatterns = [path("", views.MsailingView.as_view(), name="page")]
