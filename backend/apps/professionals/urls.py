from django.urls import path

from . import views

app_name = "professionals"

urlpatterns = [
    path("", views.ProfessionalListView.as_view(), name="list"),
    path("filters/", views.ProfessionalFilterOptionsView.as_view(), name="filters"),
    path("quotes/", views.MyQuotesView.as_view(), name="my-quotes"),
    path("quotes/<int:pk>/cancel/", views.CancelQuoteView.as_view(), name="cancel-quote"),
    path("<slug:slug>/quotes/", views.QuoteRequestCreateView.as_view(), name="quote"),
    path("<slug:slug>/reviews/", views.ReviewListCreateView.as_view(), name="reviews"),
    path("<slug:slug>/reviews/mine/", views.MyReviewView.as_view(), name="my-review"),
    path("<slug:slug>/", views.ProfessionalDetailView.as_view(), name="detail"),
]
