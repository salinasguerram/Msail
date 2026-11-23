"""Métricas que se muestran en la portada del panel de administración."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.boats.models import Boat
from apps.msailing.models import Video
from apps.premium.models import Plan, Status, Subscription
from apps.marinas.models import BerthRequest, RequestStatus
from apps.news.models import Article
from apps.profiles.models import RaceResult, SailorProfile
from apps.sailing.models import BoatClass, Club

SIGNUP_DAYS = 14


def percent(part, total):
    return round(part * 100 / total) if total else 0


def signups_by_day(users, days=SIGNUP_DAYS):
    """Altas por día de los últimos `days` días, incluyendo los días sin altas."""
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    counts = dict(
        users.filter(date_joined__date__gte=start)
        .annotate(day=TruncDate("date_joined"))
        .values_list("day")
        .annotate(total=Count("id"))
        .values_list("day", "total")
    )
    series = [{"day": start + timedelta(days=i), "total": counts.get(start + timedelta(days=i), 0)} for i in range(days)]
    peak = max((d["total"] for d in series), default=0) or 1
    for entry in series:
        entry["height"] = round(entry["total"] * 100 / peak)
    return series


def format_money(amount, currency):
    return f"{amount:,.0f} {currency}".replace(",", ".")


def premium_stats(now=None):
    """Membresías: cuántas hay activas, altas y bajas del mes, ingresos por mes y el reparto por plan."""
    now = now or timezone.now()
    month_ago = now - timedelta(days=30)
    active = Subscription.objects.with_access(now).select_related("plan")
    revenue = {}
    for subscription in active:
        if subscription.plan and subscription.status == Status.ACTIVE:
            plan = subscription.plan
            revenue[plan.currency] = revenue.get(plan.currency, 0) + plan.monthly_price
    by_plan = (
        Plan.objects.filter(subscriptions__in=active).annotate(total=Count("subscriptions", distinct=True)).order_by("-total")
    )
    return {
        "active": active.count(),
        "new": Subscription.objects.filter(started_at__gte=month_ago).count(),
        "canceled": Subscription.objects.filter(canceled_at__gte=month_ago).count(),
        "past_due": active.filter(status=Status.PAST_DUE).count(),
        "revenue": " + ".join(format_money(v, c) for c, v in sorted(revenue.items())) or "0",
        "by_plan": [{"name": p.name_es, "total": p.total} for p in by_plan],
    }


def build_dashboard():
    User = get_user_model()
    users = User.objects.filter(is_active=True)
    total_users = users.count()
    verified = users.filter(email_verified=True).count()
    week_ago = timezone.now() - timedelta(days=7)
    premium = premium_stats()

    return {
        "cards": [
            {"label": "Premium activos", "value": premium["active"], "hint": f"+{premium['new']} y −{premium['canceled']} en 30 días"},
            {
                "label": "Ingresos por mes",
                "value": premium["revenue"],
                "hint": f"de las membresías pagas · {premium['past_due']} con el pago pendiente",
            },
            {"label": "Usuarios activos", "value": total_users, "hint": f"+{users.filter(date_joined__gte=week_ago).count()} en 7 días"},
            {"label": "Emails verificados", "value": f"{percent(verified, total_users)}%", "hint": f"{verified} de {total_users}"},
            {
                "label": "Disponibles para tripular",
                "value": SailorProfile.objects.filter(available_as_crew=True, user__is_active=True).count(),
                "hint": "perfiles de navegante",
            },
            {"label": "Embarcaciones", "value": Boat.objects.count(), "hint": f"{Boat.objects.filter(is_public=False).count()} privadas"},
            {"label": "Resultados cargados", "value": RaceResult.objects.count(), "hint": f"{RaceResult.objects.filter(boat__isnull=False).count()} con barco"},
            {"label": "Clubes", "value": Club.objects.count(), "hint": f"{Club.objects.filter(is_verified=True).count()} verificados"},
            {
                "label": "Solicitudes de amarre",
                "value": BerthRequest.objects.filter(status=RequestStatus.PENDING).count(),
                "hint": f"pendientes · {BerthRequest.objects.filter(created_at__gte=week_ago).count()} nuevas en 7 días",
            },
            {
                "label": "Noticias en 7 días",
                "value": Article.visible().filter(published_at__gte=week_ago).count(),
                "hint": f"{Article.objects.filter(is_published=True, published_at__gt=timezone.now()).count()} programadas · "
                f"{Article.objects.filter(is_published=False).count()} borradores",
            },
        ],
        "signups": signups_by_day(User.objects.all()),
        "top_classes": BoatClass.objects.annotate(total=Count("sailors", distinct=True))
        .filter(total__gt=0)
        .order_by("-total", "name")[:5],
        "top_countries": users.exclude(country__isnull=True)
        .values("country__name_es")
        .annotate(total=Count("id"))
        .order_by("-total")[:5],
        "recent_users": User.objects.order_by("-date_joined")[:5],
        "premium_by_plan": premium["by_plan"],
        "top_videos": Video.objects.filter(views__gt=0).order_by("-views")[:5],
    }
