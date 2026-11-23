from django.urls import path

from . import views

app_name = "premium"

urlpatterns = [
    path("", views.PremiumView.as_view(), name="premium"),
    path("checkout/", views.CheckoutView.as_view(), name="checkout"),
    path("portal/", views.PortalView.as_view(), name="portal"),
    path("stripe/webhook/", views.StripeWebhookView.as_view(), name="stripe-webhook"),
]
