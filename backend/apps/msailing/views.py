from django.db.models import F, Sum
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.premium.models import can_see_premium

from .models import FoundationSupport, Section, Video
from .serializers import FoundationSupportSerializer, SectionSerializer, VideoDetailSerializer, VideoSerializer


def published_videos():
    return Video.objects.filter(is_published=True).prefetch_related("boat_classes")


class MsailingView(APIView):
    """Todo lo de la página MSailing en un pedido: secciones, videos y tips, y los aportes de la Fundación."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        context = {"request": request, "premium": can_see_premium(request.user)}
        sections = {s.key: SectionSerializer(s, context=context).data for s in Section.objects.all()}
        supports = FoundationSupport.objects.filter(is_published=True)
        totals = supports.exclude(amount__isnull=True).values("currency").annotate(total=Sum("amount")).order_by("currency")
        return Response(
            {
                "sections": sections,
                "videos": VideoSerializer(published_videos(), many=True, context=context).data,
                "foundation": {
                    "supports": FoundationSupportSerializer(supports, many=True, context=context).data,
                    "totals": [{"currency": t["currency"], "total": float(t["total"])} for t in totals],
                    "athletes": supports.values("beneficiary").distinct().count(),
                },
            }
        )


class VideoDetailView(APIView):
    """Un video o lección completo (con el texto). Si se puede ver, suma una vista para las estadísticas del panel."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        video = get_object_or_404(published_videos(), pk=pk)
        premium = can_see_premium(request.user)
        if premium or not video.is_premium:
            Video.objects.filter(pk=pk).update(views=F("views") + 1)
        return Response(VideoDetailSerializer(video, context={"request": request, "premium": premium}).data)
