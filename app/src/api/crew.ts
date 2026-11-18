import { api } from '@/api/client';
import type { ExperienceLevel, SailingRole } from '@/api/profiles';

/** Navegante disponible para tripular (solo datos de su perfil público). */
export type CrewMember = {
  user_id: number;
  first_name: string;
  last_name: string;
  avatar: string | null;
  city: string;
  region: string | null;
  country: string | null;
  country_name: string | null;
  experience_level: ExperienceLevel | '';
  roles: SailingRole[];
  boat_classes: string[];
};

type Page<T> = { count: number; next: string | null; results: T[] };

export function getCrew(filters: { q?: string; role?: string | null }, page = 1) {
  const query = new URLSearchParams({ page: String(page) });
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.role) query.set('role', filters.role);
  return api<Page<CrewMember>>(`/profiles/crew/?${query}`, { auth: false });
}
