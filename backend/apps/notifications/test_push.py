from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APITestCase

from . import push
from .models import Notification, NotificationKind, PushToken

User = get_user_model()
TOKEN = "ExponentPushToken[abc123]"


def make_user(email="ana@example.com"):
    return User.objects.create_user(email=email, password="clave-segura-123")


class PushTokenApiTests(APITestCase):
    def test_register_move_and_remove_token(self):
        ana, bob = make_user(), make_user("bob@example.com")
        self.client.force_authenticate(ana)
        self.assertEqual(self.client.post("/api/notifications/push-tokens/", {"token": "cualquiera"}).status_code, 400)
        self.assertEqual(self.client.post("/api/notifications/push-tokens/", {"token": TOKEN, "platform": "android"}).status_code, 204)
        self.assertEqual(PushToken.objects.get().user, ana)
        # El mismo celular con otra cuenta: pasa a la nueva.
        self.client.force_authenticate(bob)
        self.client.post("/api/notifications/push-tokens/", {"token": TOKEN})
        self.assertEqual(PushToken.objects.get().user, bob)
        self.client.delete("/api/notifications/push-tokens/", {"token": TOKEN}, format="json")
        self.assertFalse(PushToken.objects.exists())


class PushSendTests(TestCase):
    def test_new_notification_goes_to_the_phone_and_dead_tokens_are_removed(self):
        ana = make_user()
        PushToken.objects.create(user=ana, token=TOKEN)
        PushToken.objects.create(user=ana, token="ExponentPushToken[viejo]")
        reply = mock.Mock(ok=True)
        reply.json.return_value = {"data": [{"status": "ok", "id": "1"}, {"status": "error", "details": {"error": "DeviceNotRegistered"}}]}
        with mock.patch.object(push.requests, "post", return_value=reply) as post, self.captureOnCommitCallbacks(execute=True):
            Notification.objects.create(user=ana, kind=NotificationKind.BERTH, title="Aceptaron tu amarre", body="Te esperan", key="berth:1")
        messages = post.call_args.kwargs["json"]
        self.assertEqual({m["to"] for m in messages}, {TOKEN, "ExponentPushToken[viejo]"})
        self.assertEqual(messages[0]["title"], "Aceptaron tu amarre")
        self.assertEqual(messages[0]["data"], {"url": "/marinas/requests"})
        self.assertEqual(list(PushToken.objects.values_list("token", flat=True)), [TOKEN])

    def test_no_request_without_phones(self):
        ana = make_user()
        with mock.patch.object(push.requests, "post") as post, self.captureOnCommitCallbacks(execute=True):
            Notification.objects.create(user=ana, kind=NotificationKind.QUOTE, title="Presupuesto", key="quote:1")
        post.assert_not_called()
