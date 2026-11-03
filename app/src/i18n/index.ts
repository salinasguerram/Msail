import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import es from './locales/es';

export const LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'msail.language';

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** Idioma del sistema si es inglés; si no, español. */
function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'es';
}

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: deviceLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

/** Aplica el idioma elegido antes por el usuario, si lo hay. */
export async function restoreLanguage() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved) && saved !== i18n.language) await i18n.changeLanguage(saved);
  } catch {
    // sin almacenamiento disponible: queda el idioma del sistema
  }
}

export async function setLanguage(language: string) {
  if (!isLanguage(language)) return;
  await i18n.changeLanguage(language);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, language);
  } catch {
    // no es crítico
  }
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'es';
}

export default i18n;
