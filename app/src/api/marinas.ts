import { api } from '@/api/client';

/** Servicios que una marina puede informar (lo que no figura es "no informado"). */
export const MARINA_SERVICES = ['overnight', 'water', 'electricity', 'showers', 'fuel', 'wifi', 'laundry', 'security', 'boatyard'] as const;
export type MarinaService = (typeof MARINA_SERVICES)[number];

/** Tipo de lugar para amarrar o pasar la noche a bordo. */
export const PLACE_KINDS = ['marina', 'club', 'anchorage', 'moorings'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export type RateUnit = 'meter_night' | 'foot_night' | 'boat_night' | 'meter_month' | 'boat_month';

/** Tarifa orientativa informada por la marina. */
export type MarinaRate = {
  id: number;
  label: string;
  amount: number;
  currency: string;
  unit: RateUnit;
  /** Rango de eslora en metros al que aplica (null = sin límite). */
  min_length_m: number | null;
  max_length_m: number | null;
};

export type MarinaSummary = {
  id: number;
  slug: string;
  name: string;
  kind: PlaceKind;
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
  /** Primera tarifa informada (para el "desde ..." del listado). */
  headline_rate: MarinaRate | null;
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
  rates: MarinaRate[];
  /** Fecha (AAAA-MM-DD) en que la marina informó los precios. */
  prices_updated_on: string | null;
  price_notes: string;
};

export type MarinaFilters = {
  q?: string | null;
  kind?: PlaceKind | null;
  country?: string | null;
  services?: MarinaService[];
  /** Eslora del barco en metros: marinas donde entra. */
  length?: string | null;
  /** Calado del barco en metros. */
  draft?: string | null;
  /** Solo las que informan un precio orientativo. */
  withPrice?: boolean;
};

type Page<T> = { count: number; next: string | null; results: T[] };

export function getMarinas(filters: MarinaFilters, page = 1) {
  const query = new URLSearchParams({ page: String(page) });
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.country) query.set('country', filters.country);
  if (filters.kind) query.set('kind', filters.kind);
  if (filters.services?.length) query.set('services', filters.services.join(','));
  if (filters.length) query.set('length', filters.length);
  if (filters.draft) query.set('draft', filters.draft);
  if (filters.withPrice) query.set('with_price', '1');
  return api<Page<MarinaSummary>>(`/marinas/?${query}`, { auth: false });
}

export const getMarinaCountries = () =>
  api<{ countries: { value: string; label: string; count: number }[] }>('/marinas/filters/', { auth: false });

export const getMarina = (slug: string) => api<MarinaDetail>(`/marinas/${encodeURIComponent(slug)}/`, { auth: false });

// ---------- Solicitudes de amarre

export type BoatType = 'sailboat' | 'catamaran' | 'motor';
export type BerthRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export type BerthRequestInput = {
  /** Id de uno de mis barcos (completa nombre y medidas que falten). */
  boat?: number | null;
  boat_name?: string;
  boat_type: BoatType;
  length_m?: string | null;
  beam_m?: string | null;
  draft_m?: string | null;
  /** AAAA-MM-DD */
  arrival: string;
  departure: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  message?: string;
};

export type BerthRequest = {
  id: number;
  marina: { slug: string; name: string; city: string; country_name: string };
  boat_name: string;
  length_m: number;
  arrival: string;
  departure: string;
  nights: number;
  status: BerthRequestStatus;
  /** Respuesta del equipo / la marina. */
  response: string;
  responded_at: string | null;
  created_at: string;
  can_cancel: boolean;
};

export const createBerthRequest = (slug: string, data: BerthRequestInput) =>
  api<BerthRequest>(`/marinas/${encodeURIComponent(slug)}/requests/`, { method: 'POST', body: data });

export const getMyBerthRequests = () => api<Page<BerthRequest>>('/marinas/requests/');

export const cancelBerthRequest = (id: number) => api<BerthRequest>(`/marinas/requests/${id}/cancel/`, { method: 'POST' });
