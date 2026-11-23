from rest_framework import serializers

from .models import Plan, Subscription


class PlanSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    features = serializers.ListField(child=serializers.CharField(), read_only=True)
    price = serializers.SerializerMethodField()
    can_buy = serializers.SerializerMethodField()

    class Meta:
        model = Plan
        fields = ["id", "name", "price", "currency", "interval", "features", "is_highlighted", "can_buy"]

    def get_price(self, plan):
        return float(plan.price)

    def get_can_buy(self, plan):
        return bool(plan.stripe_price_id) and self.context.get("payments", False)


class SubscriptionSerializer(serializers.ModelSerializer):
    plan = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = ["status", "source", "plan", "started_at", "current_period_end", "cancel_at_period_end", "can_manage"]

    def get_plan(self, subscription):
        return subscription.plan.name if subscription.plan else None

    def get_can_manage(self, subscription):
        # Cambiar la tarjeta o cancelar se hace en el portal de Stripe; las manuales las maneja el equipo.
        return bool(subscription.stripe_customer_id) and self.context.get("payments", False)
