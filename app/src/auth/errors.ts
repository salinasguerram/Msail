import type { TFunction } from 'i18next';

import { ApiError, NetworkError } from '@/api/client';

/** Convierte un error de la API en un mensaje para mostrar arriba del formulario. */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof NetworkError) return t('auth.networkError');
  if (error instanceof ApiError && error.status === 429) {
    // Se superó el límite de intentos de esa acción: se muestra cuánto falta.
    const seconds = Number((error.data as { retry_after?: number } | null)?.retry_after);
    return seconds > 0 ? t('auth.throttledWait', { seconds }) : t('auth.throttled');
  }
  if (error instanceof ApiError && error.summary) return error.summary;
  return t('auth.genericError');
}

/** Error de un campo puntual devuelto por la API (ej. "email" ya registrado). */
export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.field(field) : undefined;
}

export const isEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
