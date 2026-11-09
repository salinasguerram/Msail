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
};

export type ProfessionalFilters = { q?: string | null; specialty?: string | null; country?: string | null };

type Page<T> = { count: number; next: string | null; results: T[] };

export function getProfessionals(filters: ProfessionalFilters, page = 1) {
  const query = new URLSearchParams({ page: String(page) });
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.specialty) query.set('specialty', filters.specialty);
  if (filters.country) query.set('country', filters.country);
  return api<Page<ProfessionalSummary>>(`/professionals/?${query}`, { auth: false });
}

export type ProfessionalFilterOptions = {
  specialties: (Specialty & { count: number })[];
  countries: { value: string; label: string; count: number }[];
};

export const getProfessionalFilterOptions = () => api<ProfessionalFilterOptions>('/professionals/filters/', { auth: false });

export const getProfessional = (slug: string) =>
  api<ProfessionalDetail>(`/professionals/${encodeURIComponent(slug)}/`, { auth: false });
