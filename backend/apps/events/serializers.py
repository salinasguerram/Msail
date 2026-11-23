from rest_framework import serializers

from apps.news.models import Article
from apps.news.serializers import ArticleCardSerializer
from apps.profiles.models import RaceResult
from apps.profiles.serializers import avatar_url

from .models import Event, EventCategory, EventDocument, EventMedia, EventResult


class EventListSerializer(serializers.ModelSerializer):
    """Fila del calendario."""

    country = serializers.CharField(source="country.iso_code", read_only=True)
    country_name = serializers.CharField(source="country.name", read_only=True)
    region = serializers.CharField(source="region.name", read_only=True, default=None)
    organizer = serializers.CharField(read_only=True)
    organizer_club = serializers.IntegerField(source="organizer_club_id", read_only=True)
    boat_classes = serializers.SlugRelatedField(slug_field="slug", many=True, read_only=True)
    status = serializers.CharField(read_only=True)
    # Foto de la tarjeta: la portada cargada o, si no hay, la primera foto de la galería.
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "cover",
            "id",
            "slug",
            "name",
            "event_type",
            "status",
            "start_date",
            "end_date",
            "country",
            "country_name",
            "region",
            "city",
            "venue",
            "organizer",
            "organizer_club",
            "boat_classes",
            "latitude",
            "longitude",
        ]


    def get_cover(self, event):
        request = self.context.get("request")
        if event.cover:
            return absolute(request, event.cover_thumb or event.cover)
        photo = next((m for m in event.media.all() if m.image), None) if hasattr(event, "media") else None
        return absolute(request, photo.thumbnail or photo.image) if photo else None


class EventCategorySerializer(serializers.ModelSerializer):
    boat_class = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = EventCategory
        fields = ["name", "boat_class", "notes"]


class EventDocumentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()
    size_kb = serializers.SerializerMethodField()

    class Meta:
        model = EventDocument
        fields = ["id", "title", "kind", "url", "source", "size_kb"]

    def get_url(self, document):
        if not document.file:
            return document.url
        url = document.file.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request and not url.startswith("http") else url

    def get_source(self, document):
        # "file": PDF subido a MSAIL; "link": documento publicado en el sitio del organizador.
        return "file" if document.file else "link"

    def get_size_kb(self, document):
        if not document.file:
            return None
        try:
            return round(document.file.size / 1024)
        except (OSError, ValueError):
            return None


class EventResultSerializer(serializers.ModelSerializer):
    country = serializers.CharField(source="country.iso_code", read_only=True, default=None)
    points = serializers.FloatField(read_only=True)
    boat = serializers.SerializerMethodField()

    class Meta:
        model = EventResult
        fields = ["position", "status", "boat_name", "sail_number", "skipper", "club", "country", "points", "time", "notes", "boat"]

    def get_boat(self, result):
        # Solo se enlaza la ficha si el barco es público.
        boat = result.boat
        return boat.id if boat and boat.is_public else None


def absolute(request, file):
    if not file:
        return None
    url = file.url
    return request.build_absolute_uri(url) if request and not url.startswith("http") else url


class EventMediaSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    thumbnail = serializers.SerializerMethodField()
    video = serializers.SerializerMethodField()

    class Meta:
        model = EventMedia
        fields = ["id", "kind", "image", "thumbnail", "video", "caption", "credit"]

    def get_image(self, media):
        return absolute(self.context.get("request"), media.image)

    def get_thumbnail(self, media):
        request = self.context.get("request")
        if media.thumbnail:
            return absolute(request, media.thumbnail)
        if media.image:
            return absolute(request, media.image)
        provider, video_id = media.video
        if provider == "youtube":
            return f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
        return None  # Vimeo sin portada: la app muestra un ícono de video

    def get_video(self, media):
        if not media.video_url:
            return None
        provider, video_id = media.video
        return {"provider": provider, "id": video_id, "url": media.video_url}


def grouped_results(event):
    """Clasificación agrupada por categoría, en el orden de las categorías. La general (sin categoría) va primero."""
    groups = {}
    for result in event.results.all():
        key = result.category_id
        if key not in groups:
            category = result.category
            groups[key] = {
                "category": category.name if category else None,
                "boat_class": category.boat_class.slug if category and category.boat_class_id else None,
                "results": [],
            }
        groups[key]["results"].append(EventResultSerializer(result).data)
    general = groups.pop(None, None)
    return ([general] if general else []) + list(groups.values())


class EventDetailSerializer(EventListSerializer):
    """Página de la regata: todo lo del calendario más organizador completo, categorías y textos."""

    organizer_club = serializers.SerializerMethodField()
    categories = EventCategorySerializer(many=True, read_only=True)
    documents = EventDocumentSerializer(many=True, read_only=True)
    entries_open = serializers.BooleanField(read_only=True)
    duration_days = serializers.SerializerMethodField()
    results = serializers.SerializerMethodField()
    msail_sailors = serializers.SerializerMethodField()
    media_count = serializers.SerializerMethodField()
    media_preview = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    followers_count = serializers.SerializerMethodField()
    news = serializers.SerializerMethodField()
    news_count = serializers.SerializerMethodField()
    professionals = serializers.SerializerMethodField()
    tracks = serializers.SerializerMethodField()

    class Meta(EventListSerializer.Meta):
        fields = EventListSerializer.Meta.fields + [
            "categories",
            "documents",
            "description",
            "website",
            "entry_url",
            "entry_deadline",
            "entries_open",
            "duration_days",
            "results",
            "results_url",
            "results_partial",
            "msail_sailors",
            "media_count",
            "media_preview",
            "is_following",
            "followers_count",
            "news",
            "news_count",
            "professionals",
            "tracks",
        ]

    def get_tracks(self, event):
        """Carreras con recorridos GPS para ver repetidas ("Track de la carrera")."""
        return [
            {"id": race.id, "name": race.name, "is_demo": race.is_demo, "boats": race.boats.count()}
            for race in event.tracks.filter(is_published=True)
        ]

    NEARBY_PROFESSIONALS_KM = 150
    NEARBY_PROFESSIONALS = 4

    def get_professionals(self, event):
        """
        Profesionales para esta regata: los que eligió el equipo en el panel o, si no eligió ninguno,
        los más cercanos a la sede (hasta 150 km). `linked` dice cuál de los dos casos es.
        """
        import math

        from apps.professionals.serializers import ProfessionalListSerializer
        from apps.professionals.views import published_professionals

        context = self.context
        linked = list(published_professionals().filter(events=event).order_by("name"))
        if linked:
            return {"linked": True, "items": ProfessionalListSerializer(linked, many=True, context=context).data}
        if event.latitude is None or event.longitude is None:
            return {"linked": False, "items": []}

        lat0, lng0 = float(event.latitude), float(event.longitude)

        def km(p):
            r = math.pi / 180
            a = math.sin((float(p.latitude) - lat0) * r / 2) ** 2 + math.cos(lat0 * r) * math.cos(float(p.latitude) * r) * math.sin(
                (float(p.longitude) - lng0) * r / 2
            ) ** 2
            return 6371 * 2 * math.asin(math.sqrt(a))

        candidates = [(km(p), p) for p in published_professionals().filter(latitude__isnull=False, longitude__isnull=False)]
        near = sorted((c for c in candidates if c[0] <= self.NEARBY_PROFESSIONALS_KM), key=lambda c: c[0])[: self.NEARBY_PROFESSIONALS]
        items = ProfessionalListSerializer([p for _d, p in near], many=True, context=context).data
        for item, (distance, _p) in zip(items, near):
            item["distance_km"] = round(distance)
        return {"linked": False, "items": items}

    def get_organizer_club(self, event):
        club = event.organizer_club
        if not club:
            return None
        return {"id": club.id, "name": club.name, "city": club.city, "website": club.website}

    def get_duration_days(self, event):
        if not event.end_date:
            return None
        return (event.end_date - event.start_date).days + 1

    MEDIA_PREVIEW = 9

    def get_is_following(self, event):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and event.follows.filter(user=user).exists())

    def get_followers_count(self, event):
        return event.follows.count()

    NEWS_PREVIEW = 3

    def event_news(self, event):
        if not hasattr(event, "_visible_news"):
            event._visible_news = Article.visible().filter(event=event).select_related("country", "event").prefetch_related("boat_classes")
        return event._visible_news

    def get_news(self, event):
        return ArticleCardSerializer(self.event_news(event)[: self.NEWS_PREVIEW], many=True, context=self.context).data

    def get_news_count(self, event):
        return self.event_news(event).count()

    def get_media_count(self, event):
        return len(event.media.all())

    def get_media_preview(self, event):
        return EventMediaSerializer(event.media.all()[: self.MEDIA_PREVIEW], many=True, context=self.context).data

    def get_results(self, event):
        return grouped_results(event)

    def get_msail_sailors(self, event):
        """Navegantes de MSAIL con perfil público que cargaron su resultado en esta regata."""
        request = self.context.get("request")
        results = (
            RaceResult.objects.filter(event=event, profile__is_public=True, profile__user__is_active=True)
            .select_related("profile__user__sailor_profile")
            .order_by("position", "id")
        )
        return [
            {
                "result_id": r.id,
                "user_id": r.profile.user_id,
                "name": r.profile.user.get_full_name() or r.profile.user.email.split("@")[0],
                "avatar": avatar_url(r.profile.user, request),
                "position": r.position,
                "fleet_size": r.fleet_size,
                "boat_name": r.boat_name,
                "role": r.role,
            }
            for r in results[:50]
        ]
