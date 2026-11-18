from django.test import SimpleTestCase

from config.email import CONSOLE_BACKEND, SMTP_BACKEND, email_settings


def env_from(values):
    return lambda name, default=None: values.get(name) or default


class EmailProviderTests(SimpleTestCase):
    def test_without_keys_prints_to_console(self):
        result = email_settings(env_from({}))
        self.assertEqual(result["EMAIL_PROVIDER"], "console")
        self.assertEqual(result["EMAIL_BACKEND"], CONSOLE_BACKEND)

    def test_resend_key_wins_over_personal_smtp(self):
        # Al pasar a Resend alcanza con cargar la clave, aunque sigan las líneas de Gmail.
        result = email_settings(env_from({"RESEND_API_KEY": "re_x", "EMAIL_HOST": "smtp.gmail.com", "EMAIL_HOST_PASSWORD": "gmail"}))
        self.assertEqual(result["EMAIL_PROVIDER"], "resend")
        self.assertEqual((result["EMAIL_HOST"], result["EMAIL_HOST_USER"], result["EMAIL_HOST_PASSWORD"]), ("smtp.resend.com", "resend", "re_x"))
        self.assertEqual(result["EMAIL_BACKEND"], SMTP_BACKEND)

    def test_sendgrid_and_brevo_presets(self):
        sendgrid = email_settings(env_from({"SENDGRID_API_KEY": "SG.x"}))
        self.assertEqual((sendgrid["EMAIL_HOST"], sendgrid["EMAIL_HOST_USER"]), ("smtp.sendgrid.net", "apikey"))
        brevo = email_settings(env_from({"BREVO_SMTP_LOGIN": "a@b.com", "BREVO_SMTP_KEY": "k"}))
        self.assertEqual((brevo["EMAIL_HOST"], brevo["EMAIL_HOST_USER"], brevo["EMAIL_HOST_PASSWORD"]), ("smtp-relay.brevo.com", "a@b.com", "k"))

    def test_explicit_provider_and_custom_smtp(self):
        result = email_settings(env_from({"EMAIL_PROVIDER": "smtp", "EMAIL_HOST": "smtp.gmail.com", "EMAIL_PORT": "465", "EMAIL_HOST_USER": "yo@gmail.com", "EMAIL_HOST_PASSWORD": "p", "RESEND_API_KEY": "re_x"}))
        self.assertEqual((result["EMAIL_PROVIDER"], result["EMAIL_HOST"], result["EMAIL_PORT"]), ("smtp", "smtp.gmail.com", 465))

    def test_chosen_provider_without_key_falls_back_to_console(self):
        self.assertEqual(email_settings(env_from({"EMAIL_PROVIDER": "resend"}))["EMAIL_PROVIDER"], "console")
