import { api } from '@/api/client';

/** Especialidad con su nombre en el idioma de la app y un ícono de Ionicons. */
export type Specialty = { slug: string; name: string; icon: string };

export type ProfessionalSummary = {
  id: number;
  slug: string;
  name: string;
  headline: string;
  specialties: Specialty[];
  city: string;
  country: string;
  country_name: string;
  region: string | null;
  logo: string | null;
  /** Datos confirmados por el profesional. Si es false, salen de fuentes públicas. */
  verified: boolean;
  has_whatsapp: boolean;
  /** Promedio de reseñas (1 a 5) o null si no tiene. */
  rating: number | null;
  reviews_count: number;
  latitude: string | null;
  longitude: string | null;
};

export type ProfessionalPhoto = { id: number; image: string; thumbnail: string; caption: string };

export type ProfessionalDetail = ProfessionalSummary & {
  description: string;
  address: string;
  service_area: string;
  whatsapp: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  languages: string;
  photos: ProfessionalPhoto[];
  latest_reviews: Review[];
  /** Mi reseña, si dejé una (null sin sesión). */
  my_review: Review | null;
};

export type Review = {
  id: number;
  rating: number;
  comment: string;
  /** Nombre e inicial del apellido. */
  author: string;
  /** Para reportar la reseña o bloquear a quien la escribió. */
  author_id: number;
  /** Pidió presupuesto a este profesional por MSAIL. */
  is_client: boolean;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfessionalFilters = { q?: string | null; specialty?: string | null; country?: string | null; byRating?: boolean };

type Page<T> = { count: number; next: string | null; results: T[] };

export function getProfessionals(filters: ProfessionalFilters, page = 1) {
  const query = new URLSearchParams({ page: String(page) });
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.specialty) query.set('specialty', filters.specialty);
  if (filters.country) query.set('country', filters.country);
  if (filters.byRating) query.set('order', 'rating');
  return api<Page<ProfessionalSummary>>(`/professionals/?${query}`, { auth: false });
}

export type ProfessionalFilterOptions = {
  specialties: (Specialty & { count: number })[];
  countries: { value: string; label: string; count: number }[];
};

export const getProfessionalFilterOptions = () => api<ProfessionalFilterOptions>('/professionals/filters/', { auth: false });

// Con token si hay sesión, para traer mi reseña.
export const getProfessional = (slug: string) => api<ProfessionalDetail>(`/professionals/${encodeURIComponent(slug)}/`);

// ---------- Reseñas

export const getReviews = (slug: string, page = 1) =>
  api<Page<Review>>(`/professionals/${encodeURIComponent(slug)}/reviews/?page=${page}`);

/** Crea o actualiza mi reseña (una por profesional). */
export const saveReview = (slug: string, data: { rating: number; comment: string }) =>
  api<Review>(`/professionals/${encodeURIComponent(slug)}/reviews/`, { method: 'POST', body: data });

export const deleteMyReview = (slug: string) =>
  api(`/professionals/${encodeURIComponent(slug)}/reviews/mine/`, { method: 'DELETE' });

// ---------- Pedidos de presupuesto

export type QuoteStatus = 'pending' | 'sent' | 'answered' | 'closed' | 'cancelled';

export type QuoteInput = {
  specialty?: string | null;
  boat?: number | null;
  boat_description?: string;
  details: string;
  location?: string;
  /** AAAA-MM-DD */
  needed_by?: string | null;
  contact_phone?: string;
};

export type Quote = {
  id: number;
  professional: { slug: string; name: string; city: string };
  specialty: string | null;
  boat_description: string;
  details: string;
  needed_by: string | null;
  status: QuoteStatus;
  response: string;
  responded_at: string | null;
  created_at: string;
  can_cancel: boolean;
  can_review: boolean;
};

export const createQuote = (slug: string, data: QuoteInput) =>
  api<Quote>(`/professionals/${encodeURIComponent(slug)}/quotes/`, { method: 'POST', body: data });

export const getMyQuotes = () => api<Page<Quote>>('/professionals/quotes/');

export const cancelQuote = (id: number) => api<Quote>(`/professionals/quotes/${id}/cancel/`, { method: 'POST' });
