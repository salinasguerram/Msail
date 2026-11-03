import { clearTokens, loadTokens, saveTokens, type Tokens } from '@/auth/tokenStorage';
import { currentLanguage } from '@/i18n';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    super(`API ${status}`);
  }

  /** Primer mensaje de error de un campo, en el formato de Django REST Framework. */
  field(name: string): string | undefined {
    const value = (this.data as Record<string, unknown> | null)?.[name];
    if (Array.isArray(value)) return String(value[0]);
    return typeof value === 'string' ? value : undefined;
  }

  /** Mensaje general: `detail`, `non_field_errors` o el primero que aparezca. */
  get summary(): string {
    const data = this.data as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return '';
    return this.field('detail') ?? this.field('non_field_errors') ?? this.field(Object.keys(data)[0]) ?? '';
  }
}

/** Sin conexión o el servidor no respondió. */
export class NetworkError extends Error {}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
};

let tokens: Tokens | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: () => void = () => {};

export async function initSession(): Promise<boolean> {
  tokens = await loadTokens();
  return tokens !== null;
}

export async function setSession(next: Tokens | null) {
  tokens = next;
  if (next) await saveTokens(next);
  else await clearTokens();
}

export function getRefreshToken() {
  return tokens?.refresh ?? null;
}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

async function rawRequest(path: string, { method = 'GET', body, auth = true }: Options) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': currentLanguage(),
  };
  // Con FormData (subida de fotos) el Content-Type lo arma fetch, con su separador multipart.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (auth && tokens) headers.Authorization = `Bearer ${tokens.access}`;

  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError();
  }
}

/** Renueva el access token. Si varias llamadas fallan a la vez, comparten una sola renovación. */
function refreshTokens(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      if (!tokens) return false;
      const response = await rawRequest('/auth/refresh/', { method: 'POST', body: { refresh: tokens.refresh }, auth: false });
      if (!response.ok) return false;
      await setSession((await response.json()) as Tokens);
      return true;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && options.auth !== false && tokens) {
    if (await refreshTokens()) {
      response = await rawRequest(path, options);
    } else {
      await setSession(null);
      onSessionExpired();
    }
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(response.status, data);
  return data as T;
}
