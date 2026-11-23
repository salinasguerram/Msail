from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification, PushToken
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    """Mis avisos, del más nuevo al más viejo."""

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).select_related("event", "article")


class UnreadCountView(APIView):
    """Cantidad de avisos sin leer (para el globito de la campana)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({"unread": Notification.objects.filter(user=request.user, read_at__isnull=True).count()})


class MarkReadView(APIView):
    """Marca como leído un aviso (/<id>/read/) o todos (/read/)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk=None):
        queryset = Notification.objects.filter(user=request.user, read_at__isnull=True)
        if pk is not None:
            queryset = queryset.filter(pk=pk)
        marked = queryset.update(read_at=timezone.now())
        unread = Notification.objects.filter(user=request.user, read_at__isnull=True).count()
        return Response({"marked": marked, "unread": unread})


class PushTokenView(APIView):
    """
    POST {token, platform}: este celular recibe los avisos push de mi cuenta.
    DELETE {token}: deja de recibirlos (al cerrar sesión).
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        token = (request.data.get("token") or "").strip()
        if not token.startswith(("ExponentPushToken[", "ExpoPushToken[")) or len(token) > 200:
            return Response({"token": ["Token inválido."]}, status=400)
        # Si el celular era de otra cuenta (cambió de usuario), pasa a esta.
        PushToken.objects.update_or_create(
            token=token, defaults={"user": request.user, "platform": (request.data.get("platform") or "")[:10]}
        )
        return Response(status=204)

    def delete(self, request):
        PushToken.objects.filter(user=request.user, token=(request.data.get("token") or "").strip()).delete()
        return Response(status=204)
