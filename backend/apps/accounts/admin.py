from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _

from .codes import CodeCooldown, issue_code
from .models import EmailCode, SocialAccount, User
from .views import revoke_sessions


class SocialAccountInline(admin.TabularInline):
    model = SocialAccount
    extra = 0
    readonly_fields = ["provider", "uid", "created_at"]
    can_delete = True


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["-date_joined"]
    list_display = ["email", "first_name", "last_name", "country", "email_verified", "is_active", "is_staff", "date_joined"]
    list_filter = ["is_active", "email_verified", "is_staff", "groups", "preferred_language", "country"]
    search_fields = ["email", "first_name", "last_name"]
    autocomplete_fields = ["country"]
    inlines = [SocialAccountInline]
    actions = ["mark_email_verified", "resend_verification", "deactivate_users", "activate_users"]

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Datos personales"), {"fields": ("first_name", "last_name", "country", "preferred_language")}),
        (_("Estado"), {"fields": ("is_active", "email_verified")}),
        (_("Permisos"), {"fields": ("is_staff", "is_superuser", "groups", "user_permissions")}),
        (_("Fechas"), {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),
    )

    @admin.action(description="Marcar email como verificado", permissions=["change"])
    def mark_email_verified(self, request, queryset):
        updated = queryset.filter(email_verified=False).update(email_verified=True)
        self.message_user(request, f"{updated} usuario(s) marcados como verificados.", messages.SUCCESS)

    @admin.action(description="Reenviar código de verificación", permissions=["change"])
    def resend_verification(self, request, queryset):
        sent = skipped = 0
        for user in queryset.filter(email_verified=False, is_active=True):
            try:
                issue_code(user, EmailCode.Purpose.VERIFY_EMAIL)
                sent += 1
            except CodeCooldown:
                skipped += 1
        self.message_user(request, f"Código enviado a {sent} usuario(s).", messages.SUCCESS)
        if skipped:
            self.message_user(request, f"{skipped} pidieron un código hace menos de un minuto.", messages.WARNING)

    @admin.action(description="Desactivar (bloquea el acceso y cierra sus sesiones)", permissions=["change"])
    def deactivate_users(self, request, queryset):
        # Nunca bloquear la propia cuenta ni a un superusuario desde una acción masiva.
        targets = queryset.filter(is_active=True, is_superuser=False).exclude(pk=request.user.pk)
        count = 0
        for user in targets:
            user.is_active = False
            user.save(update_fields=["is_active"])
            revoke_sessions(user)
            count += 1
        self.message_user(request, f"{count} usuario(s) desactivados.", messages.SUCCESS)
        if queryset.count() != count + queryset.filter(is_active=False).count():
            self.message_user(request, "Los superusuarios y tu propia cuenta no se desactivan.", messages.WARNING)

    @admin.action(description="Reactivar", permissions=["change"])
    def activate_users(self, request, queryset):
        updated = queryset.filter(is_active=False).update(is_active=True)
        self.message_user(request, f"{updated} usuario(s) reactivados.", messages.SUCCESS)
