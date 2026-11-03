import type { TFunction } from 'i18next';

import { ApiError, NetworkError } from '@/api/client';

/** Convierte un error de la API en un mensaje para mostrar arriba del formulario. */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof NetworkError) return t('auth.networkError');
  if (error instanceof ApiError && error.summary) return error.summary;
  return t('auth.genericError');
}

/** Error de un campo puntual devuelto por la API (ej. "email" ya registrado). */
export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.field(field) : undefined;
}

export const isEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
