# MSAIL LEAGUE

Plataforma internacional dedicada al mundo de la vela, de EXISSAILING LLC. Reúne en un solo lugar a navegantes, regatistas, propietarios, clubes, marinas y profesionales: calendario mundial de regatas, noticias y meteorología gratuitas, directorios de marinas y servicios, perfiles de navegantes y embarcaciones, y un planeta 3D interactivo para explorar todo por zona.

App móvil para iOS y Android (con versión web) construida con **React Native (Expo)** y un backend en **Django**.

## Estructura

```
backend/   API en Django + Django REST Framework
  apps/accounts   usuarios, autenticación, códigos por email, roles del staff
  apps/geo        países y regiones náuticas
  apps/sailing    clubes y clases de embarcación (catálogos)
  apps/profiles   perfil de navegante, resultados y fotos
  apps/boats      embarcaciones, tripulación y fotos
  apps/core       procesamiento y almacenamiento de imágenes
  config/         settings, URLs y panel de administración
app/       App en Expo / React Native (iOS, Android y web)
  src/app         pantallas (Expo Router)
  src/api         cliente de la API
  src/components  componentes de interfaz
  src/i18n        traducciones (es / en)
  src/theme       colores y tipografía
```

## Cómo correrlo en local

Requisitos: Python 3.12, Node 22.

**Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py seed_base
.venv\Scripts\python manage.py seed_clubs   # clubes reales de ejemplo (opcional)
.venv\Scripts\python manage.py createsuperuser
.venv\Scripts\python manage.py runserver 0.0.0.0:8000
```

- API: `http://localhost:8000/api/`
- Panel de administración: `http://localhost:8000/admin/`
- Sin `.env`, usa SQLite local y muestra los emails en la consola. Ver `backend/.env.example` para Supabase, el envío de emails y login social.

**App**

```bash
cd app
npm install
npx expo start
```

- `w` abre la versión web.
- En el celular: Expo Go + QR. Crear `app/.env` con `EXPO_PUBLIC_API_URL=http://<IP-de-la-PC>:8000/api` (ver `app/.env.example`).

**Tests del backend**

```bash
cd backend
.venv\Scripts\python manage.py test
```

## Servicios externos

| Servicio | Uso |
|---|---|
| Supabase | Base de datos PostgreSQL y almacenamiento de fotos |
| Resend (o SendGrid / Brevo) | Emails: verificación, recuperación, avisos y solicitudes. Ver `backend/.env.example` |
| Google Cloud / Apple Developer | Login social y publicación |
| Expo (EAS) | Builds y envío a las tiendas |

## Propiedad

Código propiedad de EXISSAILING LLC. Todos los derechos reservados.

## Publicar en Vercel

El repo tiene dos partes y en Vercel van como **dos proyectos** del mismo repositorio (cada uno con su *Root Directory*):

| Proyecto | Root Directory | Qué es |
|---|---|---|
| `msail-api` | `backend` | Django (API y panel de administración). Vercel lo detecta solo por `manage.py`. |
| `msail-web` | `app` | La app en su versión web (Expo). Usa `app/vercel.json`. |

**1. Backend (`msail-api`)** — Variables de entorno (Settings → Environment Variables):

- `DJANGO_SECRET_KEY`: una clave larga y aleatoria.
- `DATABASE_URL`: la misma de `backend/.env` (Supabase, *Session pooler*, puerto 5432).
- `CSRF_TRUSTED_ORIGINS`: `https://msail-api.vercel.app` (la dirección del backend, para entrar al panel).
- `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL`: `https://msail-web.vercel.app` (la dirección de la web).
- Las de Supabase Storage y email, iguales que en `backend/.env`.

Las migraciones no se corren solas: después de cambios en los modelos, correr `python manage.py migrate` desde la PC con el `DATABASE_URL` de Supabase.

**2. Web (`msail-web`)** — Variable de entorno: `EXPO_PUBLIC_API_URL` = `https://msail-api.vercel.app/api`.
Se lee al compilar: si se cambia, hay que volver a desplegar (Deployments → Redeploy).
