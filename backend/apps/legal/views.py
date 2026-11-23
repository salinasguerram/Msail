from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LegalPage


class LegalPageView(APIView):
    """Política de privacidad o términos, en el idioma de la app. Público: las tiendas enlazan a estas páginas."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, key):
        page = get_object_or_404(LegalPage, key=key)
        return Response({"key": page.key, "title": page.title, "body": page.body, "updated_at": page.updated_at})
