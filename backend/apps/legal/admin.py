from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import LegalPage


@admin.register(LegalPage)
class LegalPageAdmin(ModelAdmin):
    list_display = ["key", "title_es", "updated_at"]
    readonly_fields = ["updated_at"]
    fieldsets = (
        (
            None,
            {
                "fields": ("key", "updated_at"),
                "description": "Se ven en la app (Perfil → Privacidad / Términos) y en la web, en /legal/privacy y "
                "/legal/terms: esos son los links para App Store y Google Play. Conviene que los revise un abogado.",
            },
        ),
        ("Español", {"fields": ("title_es", "body_es")}),
        ("Inglés", {"fields": ("title_en", "body_en")}),
    )
