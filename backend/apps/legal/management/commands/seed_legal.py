"""
Primera versión de la política de privacidad y los términos (español e inglés). No pisa lo que ya se editó.
Es un borrador pensado para lo que hace la app hoy: conviene que lo revise un abogado antes de publicar en las tiendas.

Uso: python manage.py seed_legal
"""

from django.core.management.base import BaseCommand

from apps.legal.models import LegalPage

PRIVACY_ES = """MSAIL LEAGUE es una app y un sitio web de EXISSAILING LLC («MSAIL», «nosotros»). Esta política explica qué datos personales recopilamos, para qué los usamos, con quién los compartimos y qué derechos tenés.

## Qué datos recopilamos

Datos de tu cuenta: email, nombre, apellido, país, idioma preferido y contraseña (guardada cifrada; nunca la vemos). Si entrás con Google o Apple, recibimos tu email y tu nombre de esa cuenta.

Tu perfil de navegante, si lo completás: foto, ciudad, biografía, experiencia, puestos a bordo, clases que navegás, si estás disponible para tripular, resultados de regatas y fotos.

Tus embarcaciones: nombre, clase, datos técnicos, puerto base y fotos.

Lo que hacés en la app: regatas que seguís, solicitudes de amarre, pedidos de presupuesto a profesionales, reseñas y avisos que te enviamos.

Ubicación: solo si nos das permiso en tu dispositivo. La usamos para mostrarte el clima y lo que hay cerca en el mapa. No guardamos tu ubicación en tu cuenta.

Pagos de MSAIL Premium: los procesa Stripe. Nosotros no vemos ni guardamos los datos de tu tarjeta; solo sabemos qué plan tenés, desde cuándo y hasta cuándo.

Datos técnicos: tipo de dispositivo, navegador, dirección IP y registros de errores, para que el servicio funcione y sea seguro.

## Para qué los usamos

Para darte el servicio: tu cuenta, tu perfil, el calendario de regatas, el clima, las marinas y los profesionales.

Para enviarte emails de la cuenta (códigos de verificación, cambio de contraseña) y avisos de las regatas que seguís. Los avisos por email se pueden apagar desde tu perfil.

Para gestionar tu membresía Premium y sus cobros.

Para hacer llegar tus solicitudes a las marinas y los profesionales que elegís.

Para mantener la seguridad, evitar abusos y mejorar la app.

No vendemos tus datos personales ni los usamos para publicidad de terceros.

## Qué ven otros usuarios

Si tu perfil de navegante o tus embarcaciones son públicos, otros usuarios ven esa información (por ejemplo, en el directorio de tripulaciones). Podés hacerlos privados desde tu perfil. Tus reseñas se muestran con tu nombre.

Cuando pedís un amarre o un presupuesto, la marina o el profesional reciben los datos de contacto y del barco que pusiste en el pedido.

## Con quién los compartimos

Con proveedores que necesitamos para que el servicio funcione, que solo pueden usarlos para eso:

Supabase (base de datos y archivos), Vercel (servidores), Stripe (pagos), nuestro proveedor de envío de emails y Google y Apple (si entrás con esas cuentas).

Los servicios de clima y mapas (Open-Meteo y Esri) reciben coordenadas para devolver el pronóstico o las imágenes del mapa, sin tus datos personales.

También podemos compartir datos si la ley lo exige.

Algunos de estos proveedores procesan datos fuera de tu país (por ejemplo, en Estados Unidos o la Unión Europea), con las protecciones que exige la ley.

## Cuánto tiempo los guardamos

Mientras tu cuenta esté activa. Si la eliminás, borramos tu cuenta y tus datos (perfil, embarcaciones, resultados, solicitudes, reseñas y fotos) en ese momento. Podemos guardar algunos datos por más tiempo solo si la ley lo exige, por ejemplo registros de pagos.

## Tus derechos

Podés ver y corregir tus datos desde tu perfil, elegir qué es público y apagar los avisos por email.

Podés eliminar tu cuenta y todos tus datos desde la app: Perfil → Eliminar mi cuenta.

También podés pedirnos una copia de tus datos, o cualquier consulta sobre ellos, escribiendo a {contacto}.

## Menores

MSAIL no está dirigida a menores de 13 años. Los menores de 18 deben usarla con autorización de sus padres o tutores.

## Seguridad

Usamos conexiones cifradas, contraseñas cifradas y accesos restringidos para el equipo. Ningún sistema es 100 % seguro: si detectamos un problema que afecte tus datos, te vamos a avisar.

## Cambios en esta política

Si cambiamos algo importante, te avisamos en la app o por email. La fecha de la última actualización figura arriba.

## Contacto

EXISSAILING LLC · {contacto}"""

PRIVACY_EN = """MSAIL LEAGUE is an app and website by EXISSAILING LLC ("MSAIL", "we"). This policy explains what personal data we collect, what we use it for, who we share it with, and your rights.

## What we collect

Account data: email, first and last name, country, preferred language and password (stored encrypted; we never see it). If you sign in with Google or Apple, we receive your email and name from that account.

Your sailor profile, if you fill it in: photo, city, bio, experience, crew positions, classes you sail, whether you are available as crew, race results and photos.

Your boats: name, class, technical details, home port and photos.

What you do in the app: regattas you follow, berth requests, quote requests to professionals, reviews, and the notifications we send you.

Location: only if you allow it on your device. We use it to show you the weather and what is nearby on the map. We do not store your location in your account.

MSAIL Premium payments: processed by Stripe. We never see or store your card details; we only know which plan you have and its dates.

Technical data: device type, browser, IP address and error logs, so the service works and stays secure.

## What we use it for

To provide the service: your account, your profile, the regatta calendar, weather, marinas and professionals.

To send you account emails (verification codes, password changes) and notifications about the regattas you follow. Email notifications can be turned off in your profile.

To manage your Premium membership and its payments.

To deliver your requests to the marinas and professionals you choose.

To keep the service secure, prevent abuse and improve the app.

We do not sell your personal data or use it for third-party advertising.

## What other users see

If your sailor profile or boats are public, other users can see them (for example, in the crew directory). You can make them private in your profile. Your reviews are shown with your name.

When you request a berth or a quote, the marina or professional receives the contact and boat details you included.

## Who we share it with

With providers we need to run the service, who may only use the data for that purpose:

Supabase (database and files), Vercel (servers), Stripe (payments), our email delivery provider and Google and Apple (if you sign in with them).

Weather and map services (Open-Meteo and Esri) receive coordinates to return forecasts or map imagery, without your personal data.

We may also share data when required by law.

Some of these providers process data outside your country (for example, in the United States or the European Union), with the safeguards required by law.

## How long we keep it

While your account is active. If you delete it, we delete your account and your data (profile, boats, results, requests, reviews and photos) at that moment. We may keep some data longer only where the law requires it, such as payment records.

## Your rights

You can view and correct your data in your profile, choose what is public and turn off email notifications.

You can delete your account and all your data from the app: Profile → Delete my account.

You can also ask us for a copy of your data, or anything else about it, by writing to {contacto}.

## Children

MSAIL is not directed to children under 13. Minors under 18 must use it with the permission of a parent or guardian.

## Security

We use encrypted connections, encrypted passwords and restricted team access. No system is 100% secure: if we detect a problem affecting your data, we will let you know.

## Changes to this policy

If we make an important change, we will let you know in the app or by email. The date of the last update is shown above.

## Contact

EXISSAILING LLC · {contacto}"""

TERMS_ES = """Estos términos regulan el uso de MSAIL LEAGUE, la app y el sitio web de EXISSAILING LLC («MSAIL»). Al crear una cuenta o usar MSAIL aceptás estos términos y la política de privacidad.

## Tu cuenta

Tenés que dar datos reales y cuidar tu contraseña. Sos responsable de lo que se haga con tu cuenta. Podés eliminarla cuando quieras desde Perfil → Eliminar mi cuenta.

## Uso aceptable

No podés usar MSAIL para publicar contenido falso, ofensivo, ilegal o que infrinja derechos de otros; acosar a otros usuarios; enviar spam; ni intentar acceder sin permiso a cuentas o sistemas. Podemos quitar contenido o suspender cuentas que no cumplan estas reglas.

## Tu contenido

Lo que publicás (perfil, fotos, resultados, reseñas) sigue siendo tuyo. Nos das permiso para mostrarlo dentro de MSAIL según lo que elijas que sea público. Las reseñas tienen que ser sobre experiencias reales.

## Información náutica y seguridad

El clima, las mareas, los mapas, los calendarios y los resultados son orientativos y pueden tener errores o demoras. No reemplazan los partes meteorológicos oficiales, las instrucciones de regata ni el criterio del patrón. La seguridad a bordo es siempre responsabilidad de quien navega.

## Marinas, profesionales y eventos

MSAIL te conecta con marinas, profesionales y organizadores de regatas, pero no es parte de lo que acuerdes con ellos. Los precios, la disponibilidad y la calidad de sus servicios son responsabilidad de cada uno.

## MSAIL Premium

Premium es una suscripción paga que da acceso a contenido exclusivo. Se cobra por adelantado y se renueva sola en cada período (mensual o anual) hasta que la canceles. Podés cancelarla cuando quieras: seguís teniendo acceso hasta el final del período pagado. Los pagos los procesa Stripe. Salvo que la ley diga otra cosa, los períodos ya pagados no se reembolsan. Si cambiamos el precio, te avisamos antes de la siguiente renovación.

## Propiedad intelectual

La marca MSAIL, el logo, el diseño de la app y el contenido de MSailing (videos, lecciones y textos) son de EXISSAILING LLC o de sus autores. No podés copiarlos ni distribuirlos sin permiso.

## Responsabilidad

MSAIL se ofrece «tal cual». Hacemos lo posible para que funcione bien y sin interrupciones, pero no lo podemos garantizar. En la medida que lo permita la ley, MSAIL no responde por daños indirectos ni por decisiones tomadas en base a la información de la app.

## Cambios

Podemos actualizar estos términos. Si el cambio es importante te avisamos en la app o por email; si seguís usando MSAIL después del aviso, aceptás la nueva versión.

## Ley aplicable

Estos términos se rigen por las leyes de los Estados Unidos y del estado donde está registrada EXISSAILING LLC, sin perjuicio de los derechos que te dé la ley de tu país como consumidor.

## Contacto

EXISSAILING LLC · {contacto}"""

TERMS_EN = """These terms govern the use of MSAIL LEAGUE, the app and website by EXISSAILING LLC ("MSAIL"). By creating an account or using MSAIL you accept these terms and the privacy policy.

## Your account

You must provide real information and keep your password safe. You are responsible for what is done with your account. You can delete it at any time from Profile → Delete my account.

## Acceptable use

You may not use MSAIL to post false, offensive or illegal content or content that infringes the rights of others; harass other users; send spam; or try to access accounts or systems without permission. We may remove content or suspend accounts that break these rules.

## Your content

What you post (profile, photos, results, reviews) remains yours. You allow us to show it within MSAIL according to what you choose to make public. Reviews must be about real experiences.

## Sailing information and safety

Weather, tides, maps, calendars and results are for guidance only and may contain errors or delays. They do not replace official weather forecasts, sailing instructions or the skipper's judgment. Safety on board is always the responsibility of those sailing.

## Marinas, professionals and events

MSAIL connects you with marinas, professionals and regatta organizers, but it is not a party to what you agree with them. Prices, availability and quality of their services are their own responsibility.

## MSAIL Premium

Premium is a paid subscription that gives access to exclusive content. It is charged in advance and renews automatically each period (monthly or yearly) until you cancel it. You can cancel at any time: you keep access until the end of the paid period. Payments are processed by Stripe. Unless the law says otherwise, periods already paid are not refunded. If we change the price, we will let you know before the next renewal.

## Intellectual property

The MSAIL brand, logo, app design and MSailing content (videos, lessons and texts) belong to EXISSAILING LLC or their authors. You may not copy or distribute them without permission.

## Liability

MSAIL is provided "as is". We do our best to keep it working well and without interruptions, but we cannot guarantee it. To the extent permitted by law, MSAIL is not liable for indirect damages or for decisions made based on the information in the app.

## Changes

We may update these terms. If the change is important we will let you know in the app or by email; if you keep using MSAIL after the notice, you accept the new version.

## Governing law

These terms are governed by the laws of the United States and of the state where EXISSAILING LLC is registered, without prejudice to the rights your country's consumer law gives you.

## Contact

EXISSAILING LLC · {contacto}"""

PAGES = {
    "privacy": {"title_es": "Política de privacidad", "title_en": "Privacy policy", "body_es": PRIVACY_ES, "body_en": PRIVACY_EN},
    "terms": {"title_es": "Términos y condiciones", "title_en": "Terms and conditions", "body_es": TERMS_ES, "body_en": TERMS_EN},
}


class Command(BaseCommand):
    help = "Crea la política de privacidad y los términos (sin pisar lo ya editado)."

    def handle(self, *args, **options):
        created = 0
        for key, values in PAGES.items():
            _page, was_created = LegalPage.objects.get_or_create(key=key, defaults=values)
            created += was_created
        self.stdout.write(self.style.SUCCESS(f"Textos legales: {created} nuevos, {len(PAGES) - created} ya existían."))
