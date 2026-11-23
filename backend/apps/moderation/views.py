import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMessage
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.professionals.models import Review

from .models import Block, Reason, Report, TargetType

logger = logging.getLogger(__name__)
User = get_user_model()


class ReportInput(serializers.Serializer):
    target_type = serializers.ChoiceField(choices=TargetType.choices)
    target_id = serializers.IntegerField(min_value=1)
    reason = serializers.ChoiceField(choices=Reason.choices)
    details = serializers.CharField(max_length=1000, required=False, allow_blank=True)


def _notify_team(report):
    if not settings.MODERATION_EMAIL:
        return
    body = "\n".join(
        [
            f"{report.get_target_type_display()} #{report.target_id} · {report.get_reason_display()}",
            f"Usuario reportado: {report.reported_user or '-'}",
            f"Reportado por: {report.reporter}",
            "",
            report.details or "(sin detalle)",
            "",
            f"Revisalo en el panel: /admin/moderation/report/{report.pk}/change/",
        ]
    )
    try:
        EmailMessage("MSAIL · Nuevo reporte de contenido", body, settings.DEFAULT_FROM_EMAIL, [settings.MODERATION_EMAIL]).send()
    except Exception:  # el reporte ya quedó guardado; el email es un aviso extra
        logger.exception("No se pudo avisar el reporte %s por email", report.pk)


class ReportView(APIView):
    """Reportar un perfil o una reseña. El equipo lo revisa desde el panel."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "report"

    def post(self, request):
        data = ReportInput(data=request.data)
        data.is_valid(raise_exception=True)
        target_type, target_id = data.validated_data["target_type"], data.validated_data["target_id"]
        if target_type == TargetType.REVIEW:
            reported = get_object_or_404(Review, pk=target_id).user
        else:
            reported = get_object_or_404(User, pk=target_id, is_active=True)
        if reported == request.user:
            return Response({"detail": _("No podés reportar tu propio contenido.")}, status=status.HTTP_400_BAD_REQUEST)
        report = Report.objects.create(
            reporter=request.user,
            target_type=target_type,
            target_id=target_id,
            reported_user=reported,
            reason=data.validated_data["reason"],
            details=data.validated_data.get("details", "").strip(),
        )
        _notify_team(report)
        return Response({"id": report.pk}, status=status.HTTP_201_CREATED)


class BlockListView(APIView):
    """Mis bloqueos (GET) y bloquear a alguien (POST {user})."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        blocks = Block.objects.filter(blocker=request.user).select_related("blocked")
        return Response(
            [
                {"user_id": b.blocked_id, "name": b.blocked.get_full_name() or b.blocked.email.split("@")[0], "created_at": b.created_at}
                for b in blocks
            ]
        )

    def post(self, request):
        try:
            target = get_object_or_404(User, pk=int(request.data.get("user")), is_active=True)
        except (TypeError, ValueError):
            return Response({"detail": _("Falta el usuario.")}, status=status.HTTP_400_BAD_REQUEST)
        if target == request.user:
            return Response({"detail": _("No podés bloquearte a vos mismo.")}, status=status.HTTP_400_BAD_REQUEST)
        Block.objects.get_or_create(blocker=request.user, blocked=target)
        return Response({"user_id": target.pk}, status=status.HTTP_201_CREATED)


class BlockDetailView(APIView):
    """Desbloquear."""

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, user_id):
        Block.objects.filter(blocker=request.user, blocked_id=user_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
