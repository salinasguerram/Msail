import { api } from '@/api/client';
import type { Photo } from '@/api/photos';

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced', 'professional'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const SAILING_ROLES = [
  'skipper',
  'helmsman',
  'tactician',
  'navigator',
  'trimmer',
  'pitman',
  'bowman',
  'crew',
  'coach',
] as const;
export type SailingRole = (typeof SAILING_ROLES)[number];

export type BoatClass = {
  slug: string;
  name: string;
  category: string;
  is_olympic: boolean;
  crew_size: number | null;
};

export type RaceResult = {
  id: number;
  event_name: string;
  date: string;
  location: string;
  boat_class: string | null;
  boat: number | null;
  boat_name: string;
  role: SailingRole | '';
  position: number;
  fleet_size: number | null;
};

export type SailorProfile = {
  user_id: number;
  first_name: string;
  last_name: string;
  country: string | null;
  avatar: string | null;
  bio: string;
  city: string;
  region: { id: number; name: string; slug: string; country: string } | null;
  home_club: { id: number; name: string; city: string; country: string } | null;
  experience_level: ExperienceLevel | '';
  sailing_since: number | null;
  roles: SailingRole[];
  boat_classes: string[];
  available_as_crew: boolean;
  is_public: boolean;
  photos: Photo[];
  results: RaceResult[];
  stats: { regattas: number; podiums: number; wins: number; best_position: number | null };
};

export type ProfileUpdate = Partial<
  Pick<
    SailorProfile,
    'bio' | 'city' | 'experience_level' | 'sailing_since' | 'roles' | 'boat_classes' | 'available_as_crew' | 'is_public'
  > & { region_id: number | null; home_club_id: number | null }
>;

/** Navegante encontrado por email: solo nombre y foto. */
export type CrewCandidate = {
  user_id: number;
  first_name: string;
  last_name: string;
  avatar: string | null;
};

export type ResultDetail = RaceResult & {
  sailor: { user_id: number; name: string; avatar: string | null };
  boat_detail: { id: number; name: string; sail_number: string } | null;
  is_mine: boolean;
};

export type ResultInput = Omit<RaceResult, 'id'>;

export const getMyProfile = () => api<SailorProfile>('/profiles/me/');

export const updateMyProfile = (data: ProfileUpdate) =>
  api<SailorProfile>('/profiles/me/', { method: 'PATCH', body: data });

export const getBoatClasses = () => api<BoatClass[]>('/boat-classes/', { auth: false });

export const createResult = (data: ResultInput) =>
  api<RaceResult>('/profiles/me/results/', { method: 'POST', body: data });

export const updateResult = (id: number, data: Partial<ResultInput>) =>
  api<RaceResult>(`/profiles/me/results/${id}/`, { method: 'PATCH', body: data });

export const deleteResult = (id: number) => api(`/profiles/me/results/${id}/`, { method: 'DELETE' });

/** Busca una cuenta de MSAIL por su email exacto (404 si no existe). */
export const lookupSailor = (email: string) =>
  api<CrewCandidate>(`/profiles/lookup/?email=${encodeURIComponent(email.trim())}`);

export const getResult = (id: number) => api<ResultDetail>(`/profiles/results/${id}/`);
