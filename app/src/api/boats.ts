import { api } from '@/api/client';
import type { Photo } from '@/api/photos';
import type { SailingRole } from '@/api/profiles';

export type CrewMember = {
  id: number;
  user_id: number | null;
  name: string;
  display_name: string;
  avatar: string | null;
  role: SailingRole | '';
  is_active: boolean;
};

export type BoatSummary = {
  id: number;
  name: string;
  boat_class: string | null;
  model: string;
  sail_number: string;
  home_port: string;
  country: string | null;
  is_public: boolean;
  cover: string | null;
  /** Medidas en metros (texto decimal, ej. "11.20"), null si no se cargaron. */
  length_m: string | null;
  beam_m: string | null;
  draft_m: string | null;
};

export type BoatHistoryEntry = {
  id: number;
  event_name: string;
  date: string;
  location: string;
  boat_class: string | null;
  position: number;
  fleet_size: number | null;
  sailor: { user_id: number; name: string };
};

export type Boat = BoatSummary & {
  owner: { user_id: number; name: string };
  is_owner: boolean;
  builder: string;
  designer: string;
  year_built: number | null;
  hull_color: string;
  /** Decimales: Django los devuelve como texto ("6.93"). */
  length_m: string | null;
  beam_m: string | null;
  draft_m: string | null;
  displacement_kg: number | null;
  rating: string;
  description: string;
  photos: Photo[];
  crew: CrewMember[];
  history: BoatHistoryEntry[];
  stats: { regattas: number; podiums: number; wins: number; best_position: number | null };
};

export type BoatInput = Partial<
  Pick<
    Boat,
    | 'name'
    | 'boat_class'
    | 'model'
    | 'builder'
    | 'designer'
    | 'year_built'
    | 'sail_number'
    | 'hull_color'
    | 'length_m'
    | 'beam_m'
    | 'draft_m'
    | 'displacement_kg'
    | 'rating'
    | 'home_port'
    | 'description'
    | 'is_public'
  >
>;

export const getMyBoats = () => api<BoatSummary[]>('/boats/mine/');
export const getBoat = (id: number) => api<Boat>(`/boats/${id}/`);
export const createBoat = (data: BoatInput) => api<Boat>('/boats/mine/', { method: 'POST', body: data });
export const updateBoat = (id: number, data: BoatInput) => api<Boat>(`/boats/${id}/`, { method: 'PATCH', body: data });
export const deleteBoat = (id: number) => api(`/boats/${id}/`, { method: 'DELETE' });

/** Con `user_id` se vincula a un navegante de MSAIL; si no, alcanza con el nombre. */
export const addCrew = (boatId: number, data: { user_id?: number; name?: string; role: SailingRole | '' }) =>
  api<CrewMember>(`/boats/${boatId}/crew/`, { method: 'POST', body: data });
export const updateCrew = (boatId: number, id: number, data: Partial<Pick<CrewMember, 'name' | 'role' | 'is_active'>>) =>
  api<CrewMember>(`/boats/${boatId}/crew/${id}/`, { method: 'PATCH', body: data });
export const removeCrew = (boatId: number, id: number) => api(`/boats/${boatId}/crew/${id}/`, { method: 'DELETE' });

/** "6.93" → "6.93 m (22.7 ft)" */
export function formatMeters(value: string | null, template: (v: { value: string; feet: string }) => string) {
  if (!value) return null;
  const meters = Number(value);
  return template({ value: meters.toString(), feet: (meters * 3.28084).toFixed(1) });
}
