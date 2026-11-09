from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(ModelAdmin):
    """Solo consulta: los avisos los genera el sistema."""

    list_display = ["title", "user", "kind", "created_at", "read_at", "emailed"]
    list_filter = ["kind", "emailed", ("read_at", admin.EmptyFieldListFilter)]
    search_fields = ["title", "user__email", "event__name"]
    readonly_fields = ["user", "kind", "title", "body", "event", "key", "created_at", "read_at", "emailed"]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
