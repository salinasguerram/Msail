# MSAIL LEAGUE

Plataforma internacional dedicada al mundo de la vela, de EXISSAILING LLC. Reúne en un solo lugar a navegantes, regatistas, propietarios, clubes, marinas y profesionales: calendario mundial de regatas, noticias y meteorología gratuitas, directorios de marinas y servicios, perfiles de navegantes y embarcaciones, y un planeta 3D interactivo para explorar todo por zona.

App móvil para iOS y Android (con versión web) construida con **React Native (Expo)** y un backend en **Django**.

## Estado

Plan de 8 semanas para la Fase 1 (MVP).

| Semana | Contenido | Estado |
|---|---|---|
| 1 | Registro, login (email, Google, Apple), verificación de email, recuperación de contraseña, navegación con tema oscuro, español e inglés | ✅ |
| 2 | Perfil de navegante, perfil de embarcación, panel de administración, subida de fotos | ✅ |
| 3–4 | Calendario de regatas, páginas de evento, resultados, noticias | Pendiente |
| 5–6 | Directorio de marinas, profesionales y meteorología semanal | Pendiente |
| 7 | Planeta 3D, contenido educativo y membresía Premium | Pendiente |
| 8 | Pruebas y publicación en App Store, Google Play y web | Pendiente |

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
.venv\Scripts\python manage.py createsuperuser
.venv\Scripts\python manage.py runserver 0.0.0.0:8000
```

- API: `http://localhost:8000/api/`
- Panel de administración: `http://localhost:8000/admin/`
- Sin `.env`, usa SQLite local y muestra los emails en la consola. Ver `backend/.env.example` para Supabase, SendGrid y login social.

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
| Twilio SendGrid | Emails de verificación y recuperación |
| Google Cloud / Apple Developer | Login social y publicación |
| Expo (EAS) | Builds y envío a las tiendas |

## Propiedad

Código propiedad de EXISSAILING LLC. Todos los derechos reservados.
