from io import StringIO

from django.contrib.auth.models import Group
from django.core import mail
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.roles import ADMINISTRATORS, MODERATORS
from apps.boats.models import Boat
from apps.profiles.models import SailorProfile

from .models import User


class AdminPanelTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_base", stdout=StringIO())
        cls.superuser = User.objects.create_superuser(email="root@msail.com", password="x-segura-123")
        cls.sailor = User.objects.create_user(email="nav@example.com", password="x-segura-123", first_name="Nico")

    def setUp(self):
        self.client.force_login(self.superuser)

    def run_action(self, model_url, action, ids):
        return self.client.post(
            reverse(model_url),
            {"action": action, "_selected_action": [str(i) for i in ids]},
            follow=True,
        )


class DashboardTests(AdminPanelTestCase):
    def test_index_shows_metrics(self):
        response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, 200)
        cards = {c["label"]: c["value"] for c in response.context["dashboard"]["cards"]}
        self.assertEqual(cards["Usuarios activos"], 2)
        self.assertEqual(len(response.context["dashboard"]["signups"]), 14)
        self.assertContains(response, "Altas de los últimos 14 días")
        self.assertContains(response, "MSAIL LEAGUE")
        self.assertContains(response, "http://localhost:8081")  # "Ver el sitio" lleva a la app

    def test_regular_user_cannot_enter(self):
        self.client.force_login(self.sailor)
        response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, 302)

    def test_all_changelists_load(self):
        for name in [
            "accounts_user",
            "auth_group",
            "geo_country",
            "geo_region",
            "sailing_boatclass",
            "sailing_club",
            "profiles_sailorprofile",
            "profiles_raceresult",
            "boats_boat",
        ]:
            with self.subTest(name=name):
                self.assertEqual(self.client.get(reverse(f"admin:{name}_changelist")).status_code, 200)


class UserActionTests(AdminPanelTestCase):
    def test_mark_verified(self):
        self.run_action("admin:accounts_user_changelist", "mark_email_verified", [self.sailor.pk])
        self.sailor.refresh_from_db()
        self.assertTrue(self.sailor.email_verified)

    def test_resend_verification_sends_email(self):
        self.run_action("admin:accounts_user_changelist", "resend_verification", [self.sailor.pk])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["nav@example.com"])

    def test_deactivate_closes_sessions(self):
        refresh = RefreshToken.for_user(self.sailor)
        self.run_action("admin:accounts_user_changelist", "deactivate_users", [self.sailor.pk])
        self.sailor.refresh_from_db()
        self.assertFalse(self.sailor.is_active)
        response = self.client.post("/api/auth/refresh/", {"refresh": str(refresh)}, content_type="application/json")
        self.assertEqual(response.status_code, 401)

        self.run_action("admin:accounts_user_changelist", "activate_users", [self.sailor.pk])
        self.sailor.refresh_from_db()
        self.assertTrue(self.sailor.is_active)

    def test_deactivate_never_blocks_self_or_superusers(self):
        self.run_action("admin:accounts_user_changelist", "deactivate_users", [self.superuser.pk])
        self.superuser.refresh_from_db()
        self.assertTrue(self.superuser.is_active)

    def test_export_csv(self):
        response = self.client.post(
            reverse("admin:accounts_user_changelist"),
            {"action": "export_as_csv", "_selected_action": [str(self.sailor.pk)]},
        )
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        content = response.content.decode("utf-8-sig")
        header, row = content.strip().splitlines()[:2]
        self.assertIn("email", header)
        self.assertIn("nav@example.com", row)
        self.assertIn("Nico", row)


class ModerationTests(AdminPanelTestCase):
    def test_hide_profile_and_boat(self):
        profile = SailorProfile.objects.get(user=self.sailor)
        boat = Boat.objects.create(owner=self.sailor, name="Brisa")
        self.run_action("admin:profiles_sailorprofile_changelist", "make_private", [profile.pk])
        self.run_action("admin:boats_boat_changelist", "make_private", [boat.pk])
        profile.refresh_from_db()
        boat.refresh_from_db()
        self.assertFalse(profile.is_public)
        self.assertFalse(boat.is_public)


class RolesTests(AdminPanelTestCase):
    def make_staff(self, group_name):
        user = User.objects.create_user(email=f"{group_name.lower()}@msail.com", password="x-segura-123", is_staff=True, email_verified=True)
        user.groups.add(Group.objects.get(name=group_name))
        self.client.force_login(user)
        return user

    def test_groups_exist_after_migrate(self):
        self.assertTrue(Group.objects.filter(name=ADMINISTRATORS).exists())
        self.assertTrue(Group.objects.filter(name=MODERATORS).exists())

    def test_moderator_can_edit_profiles_but_not_delete_users(self):
        moderator = self.make_staff(MODERATORS)
        self.assertTrue(moderator.has_perm("profiles.change_sailorprofile"))
        self.assertFalse(moderator.has_perm("accounts.delete_user"))
        self.assertFalse(moderator.has_perm("auth.change_group"))
        self.assertEqual(self.client.get(reverse("admin:profiles_sailorprofile_changelist")).status_code, 200)
        delete_url = reverse("admin:accounts_user_delete", args=[self.sailor.pk])
        self.assertEqual(self.client.get(delete_url).status_code, 403)

    def test_administrator_manages_users_but_not_permissions(self):
        administrator = self.make_staff(ADMINISTRATORS)
        self.assertTrue(administrator.has_perm("accounts.delete_user"))
        self.assertTrue(administrator.has_perm("boats.delete_boat"))
        self.assertFalse(administrator.has_perm("auth.change_group"))
