import 'i18next';

import type { Translations } from './locales/es';

// Autocompletado y chequeo de tipos de las claves de traducción.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: Translations };
  }
}
