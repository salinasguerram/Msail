from datetime import timedelta

from django.db.models import Case, Count, IntegerField, Value, When
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.text import normalize

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
    """
    Noticias publicadas, de la más nueva a la más vieja. Filtros opcionales y combinables:
      ?country=ES   ?class=<slug de clase>   ?event=<slug de la regata o campeonato>
      ?q=texto   busca en título, bajada, texto, país, regata y clases (sin importar tildes; cada palabra tiene que aparecer)
    """

    serializer_class = ArticleCardSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return filter_articles(visible_articles(), self.request.query_params)


def filter_articles(queryset, params):
    if country := params.get("country", "").strip().upper():
        queryset = queryset.filter(country__iso_code=country)
    if boat_class := params.get("class", "").strip():
        queryset = queryset.filter(boat_classes__slug=boat_class)
    if event := params.get("event", "").strip():
        queryset = queryset.filter(event__slug=event, event__is_published=True)
    for word in normalize(params.get("q", "")).split()[:8]:
        queryset = queryset.filter(search_text__contains=word)
    return queryset.distinct()


class FilterOptionsView(APIView):
    """Países, clases y campeonatos que tienen noticias publicadas (para no ofrecer filtros vacíos)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from apps.events.models import Event
        from apps.geo.models import Country
        from apps.sailing.models import BoatClass

        visible = Article.visible().values("pk")
        countries = Country.objects.filter(pk__in=Article.visible().values("country")).order_by("name_es")
        classes = BoatClass.objects.filter(articles__in=visible).annotate(total=Count("articles", distinct=True)).order_by("name")
        events = (
            Event.objects.filter(is_published=True, articles__in=visible)
            .annotate(total=Count("articles", distinct=True))
            .order_by("-start_date")
        )
        return Response(
            {
                "countries": [{"value": c.iso_code, "label": c.name} for c in countries],
                "classes": [{"value": c.slug, "label": c.name, "count": c.total} for c in classes],
                "events": [{"value": e.slug, "label": e.name, "count": e.total} for e in events],
            }
        )


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
