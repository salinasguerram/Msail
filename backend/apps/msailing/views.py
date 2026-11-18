from django.db.models import Sum
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FoundationSupport, Section, Video
from .serializers import FoundationSupportSerializer, SectionSerializer, VideoSerializer


class MsailingView(APIView):
    """Todo lo de la página MSailing en un pedido: secciones, videos y tips, y los aportes de la Fundación."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        context = {"request": request}
        sections = {s.key: SectionSerializer(s, context=context).data for s in Section.objects.all()}
        supports = FoundationSupport.objects.filter(is_published=True)
        totals = supports.exclude(amount__isnull=True).values("currency").annotate(total=Sum("amount")).order_by("currency")
        return Response(
            {
                "sections": sections,
                "videos": VideoSerializer(Video.objects.filter(is_published=True), many=True).data,
                "foundation": {
                    "supports": FoundationSupportSerializer(supports, many=True, context=context).data,
                    "totals": [{"currency": t["currency"], "total": float(t["total"])} for t in totals],
                    "athletes": supports.values("beneficiary").distinct().count(),
                },
            }
        )
