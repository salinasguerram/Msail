import { api } from '@/api/client';

/** Servicios que una marina puede informar (lo que no figura es "no informado"). */
export const MARINA_SERVICES = ['water', 'electricity', 'showers', 'fuel', 'wifi', 'laundry', 'security', 'boatyard'] as const;
export type MarinaService = (typeof MARINA_SERVICES)[number];

export type MarinaSummary = {
  id: number;
  slug: string;
  name: string;
  city: string;
  country: string;
  country_name: string;
  region: string | null;
  berths: number | null;
  /** Eslora máxima en metros (null si la marina no lo informa). */
  max_length_m: number | null;
  /** Profundidad / calado máximo en metros. */
  max_draft_m: number | null;
  services: MarinaService[];
  /** Datos confirmados por la marina. Si es false, salen de fuentes públicas. */
  verified: boolean;
  cover: string | null;
  latitude: string | null;
  longitude: string | null;
};

export type MarinaPhoto = { id: number; image: string; thumbnail: string; caption: string; credit: string };

export type MarinaDetail = MarinaSummary & {
  address: string;
  description: string;
  website: string;
  email: string;
  phone: string;
  whatsapp: string;
  vhf_channel: string;
  photos: MarinaPhoto[];
};

export type MarinaFilters = {
  q?: string | null;
  country?: string | null;
  services?: MarinaService[];
  /** Eslora del barco en metros: marinas donde entra. */
  length?: string | null;
  /** Calado del barco en metros. */
  draft?: string | null;
};

type Page<T> = { count: number; next: string | null; results: T[] };

export function getMarinas(filters: MarinaFilters, page = 1) {
  const query = new URLSearchParams({ page: String(page) });
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.country) query.set('country', filters.country);
  if (filters.services?.length) query.set('services', filters.services.join(','));
  if (filters.length) query.set('length', filters.length);
  if (filters.draft) query.set('draft', filters.draft);
  return api<Page<MarinaSummary>>(`/marinas/?${query}`, { auth: false });
}

export const getMarinaCountries = () =>
  api<{ countries: { value: string; label: string; count: number }[] }>('/marinas/filters/', { auth: false });

export const getMarina = (slug: string) => api<MarinaDetail>(`/marinas/${encodeURIComponent(slug)}/`, { auth: false });
