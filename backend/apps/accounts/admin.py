from django.contrib import admin, messages
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from django.utils.translation import gettext_lazy as _
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import display
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

from .codes import CodeCooldown, issue_code
from .models import EmailCode, SocialAccount, User
from .roles import ADMINISTRATORS, MODERATORS, setup_roles
from .views import revoke_sessions

# Campos que dan acceso o permisos: solo los cambia un superusuario (si no, un moderador podría darse más permisos).
PERMISSION_FIELDS = ("is_staff", "is_superuser", "groups", "user_permissions")


def team_role(user):
    """Rol en el equipo de MSAIL, como se muestra en la lista de usuarios."""
    if user.is_superuser:
        return "Superusuario"
    if not user.is_staff:
        return None
    names = {group.name for group in user.groups.all()}
    if ADMINISTRATORS in names:
        return "Administrador"
    if MODERATORS in names:
        return "Moderador"
    return "Staff sin rol"


class TeamFilter(admin.SimpleListFilter):
    title = "rol en el equipo"
    parameter_name = "team"

    def lookups(self, request, model_admin):
        return [("team", "Del equipo (staff)"), ("admins", "Administradores"), ("mods", "Moderadores"), ("users", "Usuarios de la app")]

    def queryset(self, request, queryset):
        value = self.value()
        if value == "team":
            return queryset.filter(is_staff=True)
        if value == "admins":
            return queryset.filter(is_staff=True, groups__name=ADMINISTRATORS)
        if value == "mods":
            return queryset.filter(is_staff=True, groups__name=MODERATORS)
        if value == "users":
            return queryset.filter(is_staff=False)
        return queryset


class SocialAccountInline(TabularInline):
    model = SocialAccount
    extra = 0
    readonly_fields = ["provider", "uid", "created_at"]
    can_delete = True


# Las sesiones (tokens) se gestionan con "Desactivar", no hace falta verlas en el panel.
admin.site.unregister(OutstandingToken)
admin.site.unregister(BlacklistedToken)
admin.site.unregister(Group)


@admin.register(Group)
class GroupAdmin(BaseGroupAdmin, ModelAdmin):
    pass


@admin.register(User)
class UserAdmin(BaseUserAdmin, ModelAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm
    ordering = ["-date_joined"]
    list_display = ["email", "first_name", "last_name", "country", "email_verified", "is_active", "role", "date_joined"]
    list_filter = [TeamFilter, "is_active", "email_verified", "preferred_language", "country"]
    search_fields = ["email", "first_name", "last_name"]
    autocomplete_fields = ["country"]
    inlines = [SocialAccountInline]
    actions = [
        "make_administrator",
        "make_moderator",
        "remove_from_team",
        "mark_email_verified",
        "resend_verification",
        "deactivate_users",
        "activate_users",
    ]

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Datos personales"), {"fields": ("first_name", "last_name", "country", "preferred_language")}),
        (_("Estado"), {"fields": ("is_active", "email_verified")}),
        (
            _("Equipo de MSAIL"),
            {
                "fields": PERMISSION_FIELDS,
                "description": _(
                    "«Es staff» le da acceso a este panel. Qué puede hacer depende del grupo: Administradores gestionan "
                    "todo el contenido y los usuarios; Moderadores revisan y corrigen. También se hace desde la lista de "
                    "usuarios con las acciones «Sumar al equipo…» y «Quitar del equipo». Solo un superusuario lo cambia."
                ),
            },
        ),
        (_("Fechas"), {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("groups")

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if not request.user.is_superuser:
            readonly += PERMISSION_FIELDS
        return readonly

    @display(
        description="rol en el equipo",
        label={"Superusuario": "danger", "Administrador": "success", "Moderador": "info", "Staff sin rol": "warning"},
    )
    def role(self, user):
        return team_role(user) or "—"

    def has_team_permission(self, request):
        return request.user.is_superuser

    def _join_team(self, request, queryset, group_name):
        administrators, moderators = setup_roles()
        group = administrators if group_name == ADMINISTRATORS else moderators
        count = 0
        for user in queryset.filter(is_superuser=False):
            user.is_staff = True
            user.save(update_fields=["is_staff"])
            user.groups.remove(administrators, moderators)
            user.groups.add(group)
            count += 1
        self.message_user(request, f"{count} usuario(s) ahora son {group_name.lower()} y pueden entrar al panel.", messages.SUCCESS)
        if queryset.filter(is_superuser=True).exists():
            self.message_user(request, "Los superusuarios ya tienen todos los permisos: no se cambian.", messages.WARNING)

    @admin.action(description="Sumar al equipo como Administrador (gestiona todo)", permissions=["team"])
    def make_administrator(self, request, queryset):
        self._join_team(request, queryset, ADMINISTRATORS)

    @admin.action(description="Sumar al equipo como Moderador (revisa y corrige)", permissions=["team"])
    def make_moderator(self, request, queryset):
        self._join_team(request, queryset, MODERATORS)

    @admin.action(description="Quitar del equipo (pierde el acceso al panel)", permissions=["team"])
    def remove_from_team(self, request, queryset):
        # Nunca la propia cuenta ni un superusuario: así no se puede dejar el panel sin nadie que lo maneje.
        targets = queryset.filter(is_superuser=False).exclude(pk=request.user.pk)
        count = 0
        for user in targets:
            user.is_staff = False
            user.save(update_fields=["is_staff"])
            user.groups.clear()
            user.user_permissions.clear()
            count += 1
        self.message_user(request, f"{count} usuario(s) quitados del equipo.", messages.SUCCESS)
        if queryset.count() != count:
            self.message_user(request, "Los superusuarios y tu propia cuenta no se quitan del equipo.", messages.WARNING)

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
