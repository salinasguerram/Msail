from datetime import timedelta

from django.db.models import Case, IntegerField, Value, When
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Article, Highlight
from .serializers import ArticleCardSerializer, ArticleDetailSerializer

DAY_WINDOW = timedelta(hours=36)
WEEK_WINDOW = timedelta(days=7)
WEEK_SIZE = 5
LATEST_SIZE = 10


def visible_articles():
    return Article.visible().select_related("country", "event").prefetch_related("boat_classes")


def front_page():
    """
    Portada de la sección:
    - day: la última noticia marcada "Portada del día" de las últimas 36 h; si no hay, la más reciente.
    - week: hasta 5 noticias de los últimos 7 días: primero las marcadas "de la semana", después las más leídas.
    - latest: las más recientes que no están arriba.
    """
    now = timezone.now()
    articles = visible_articles()
    day = articles.filter(highlight=Highlight.DAY, published_at__gte=now - DAY_WINDOW).first() or articles.first()
    shown = [day.pk] if day else []
    week = list(
        articles.filter(published_at__gte=now - WEEK_WINDOW)
        .exclude(pk__in=shown)
        .annotate(featured=Case(When(highlight=Highlight.WEEK, then=Value(0)), default=Value(1), output_field=IntegerField()))
        .order_by("featured", "-views", "-published_at")[:WEEK_SIZE]
    )
    shown += [a.pk for a in week]
    latest = list(articles.exclude(pk__in=shown)[:LATEST_SIZE])
    return day, week, latest


class FrontPageView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        day, week, latest = front_page()
        context = {"request": request}
        return Response(
            {
                "day": ArticleCardSerializer(day, context=context).data if day else None,
                "week": ArticleCardSerializer(week, many=True, context=context).data,
                "latest": ArticleCardSerializer(latest, many=True, context=context).data,
            }
        )


class ArticleListView(generics.ListAPIView):
    """Todas las noticias publicadas, de la más nueva a la más vieja."""

    serializer_class = ArticleCardSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return visible_articles()


class ArticleDetailView(generics.RetrieveAPIView):
    serializer_class = ArticleDetailSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        return visible_articles()

    def retrieve(self, request, *args, **kwargs):
        article = self.get_object()
        article.add_view()  # cuenta para "lo más leído de la semana"
        return Response(self.get_serializer(article).data)
