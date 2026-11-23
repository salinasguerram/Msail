import type { ProfessionalSummary } from '@/api/professionals';
import { api } from '@/api/client';
import type { ArticleCard } from '@/api/news';

export const EVENT_TYPES = ['offshore', 'inshore', 'one_design', 'olympic', 'multihull', 'youth'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type EventStatus = 'upcoming' | 'live' | 'finished';
/** Pestañas del calendario. 'following' son las regatas que sigo (pasadas y futuras). */
export type EventWhen = 'upcoming' | 'live' | 'past' | 'following';

export type EventSummary = {
  id: number;
  slug: string;
  name: string;
  event_type: EventType;
  status: EventStatus;
  start_date: string;
  /** null cuando solo se conoce la largada (regatas oceánicas). */
  end_date: string | null;
  country: string;
  country_name: string;
  region: string | null;
  city: string;
  venue: string;
  organizer: string;
  organizer_club: number | null;
  boat_classes: string[];
  /** Foto de la tarjeta (portada o primera de la galería). */
  cover: string | null;
  latitude: string | null;
  longitude: string | null;
};

export type EventFilters = {
  when: EventWhen;
  type?: EventType | null;
  country?: string | null;
  club?: number | null;
  boatClass?: string | null;
  /** Mes como 'AAAA-MM': se piden las regatas que caen (aunque sea en parte) en ese mes. */
  month?: string | null;
  /** Texto libre: nombre, ciudad, sede, organizador, país o clase (sin importar tildes). */
  q?: string | null;
};

type Page<T> = { count: number; next: string | null; results: T[] };

function monthRange(month: string) {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(year, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function getEvents(filters: EventFilters, page = 1) {
  const following = filters.when === 'following';
  const query = new URLSearchParams({ page: String(page) });
  if (following) query.set('following', '1');
  else query.set('when', filters.when);
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.type) query.set('type', filters.type);
  if (filters.country) query.set('country', filters.country);
  if (filters.club) query.set('club', String(filters.club));
  if (filters.boatClass) query.set('class', filters.boatClass);
  if (filters.month) {
    const { from, to } = monthRange(filters.month);
    query.set('from', from);
    query.set('to', to);
  }
  // Con sesión se manda el token: lo necesita "Siguiendo" (y no cambia nada en las demás pestañas).
  return api<Page<EventSummary>>(`/events/?${query}`, { auth: following });
}

export type EventCategory = { name: string; boat_class: string | null; notes: string };

export const DOCUMENT_KINDS = ['notice_of_race', 'sailing_instructions', 'entry_list', 'results', 'amendment', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type EventDocument = {
  id: number;
  title: string;
  kind: DocumentKind;
  url: string;
  /** 'file': PDF subido a MSAIL; 'link': documento en el sitio del organizador. */
  source: 'file' | 'link';
  size_kb: number | null;
};

export type ResultStatus = 'finished' | 'dnf' | 'dns' | 'ret' | 'dsq' | 'ocs';

export type EventResult = {
  /** null si no terminó (ver status). */
  position: number | null;
  status: ResultStatus;
  boat_name: string;
  sail_number: string;
  skipper: string;
  club: string;
  country: string | null;
  points: number | null;
  time: string;
  notes: string;
  /** Id de la embarcación en MSAIL (solo si es pública). */
  boat: number | null;
};

/** Clasificación de una categoría; category null = general. */
export type ResultGroup = { category: string | null; boat_class: string | null; results: EventResult[] };

/** Navegante de MSAIL que cargó su resultado en la regata. */
export type EventSailor = {
  result_id: number;
  user_id: number;
  name: string;
  avatar: string | null;
  position: number;
  fleet_size: number | null;
  boat_name: string;
  role: string;
};

export type EventMedia = {
  id: number;
  kind: 'photo' | 'video';
  /** Foto en tamaño grande (en videos, la portada si se subió). */
  image: string | null;
  /** Miniatura cuadrada para la grilla (en videos de YouTube, la portada de YouTube). */
  thumbnail: string | null;
  video: { provider: 'youtube' | 'vimeo'; id: string; url: string } | null;
  caption: string;
  credit: string;
};

export type EventDetail = Omit<EventSummary, 'organizer_club'> & {
  organizer_club: { id: number; name: string; city: string; website: string } | null;
  categories: EventCategory[];
  documents: EventDocument[];
  description: string;
  website: string;
  entry_url: string;
  entry_deadline: string | null;
  /** Hay link de inscripción y todavía está abierta. */
  entries_open: boolean;
  /** Días que dura (null si solo se conoce la largada). */
  duration_days: number | null;
  latitude: string | null;
  longitude: string | null;
  results: ResultGroup[];
  /** Link a la clasificación completa en el sitio del organizador. */
  results_url: string;
  /** Solo están cargados los ganadores o el podio. */
  results_partial: boolean;
  msail_sailors: EventSailor[];
  /** Total de fotos y videos; media_preview trae los primeros. */
  media_count: number;
  media_preview: EventMedia[];
  /** La sigo (recibo avisos). Siempre false sin sesión. */
  is_following: boolean;
  followers_count: number;
  /** Últimas noticias de la regata y cuántas hay en total. */
  news: ArticleCard[];
  news_count: number;
  /** Profesionales para esta regata: elegidos por el equipo (linked) o los más cercanos a la sede. */
  professionals: { linked: boolean; items: (ProfessionalSummary & { distance_km?: number })[] };
  /** Carreras con recorridos GPS para ver repetidas ("Track de la carrera"). */
  tracks: { id: number; name: string; is_demo: boolean; boats: number }[];
};

/** Recorridos GPS de una carrera: cada barco con sus puntos [segundos UNIX, latitud, longitud] cada 5 s. */
export type RaceTrack = {
  id: number;
  name: string;
  is_demo: boolean;
  event: { slug: string; name: string };
  start: number | null;
  end: number | null;
  boats: {
    id: number;
    boat_name: string;
    sail_number: string;
    skipper: string;
    color: string;
    max_speed_kn: number;
    points: [number, number, number][];
  }[];
};

export const getRaceTrack = (id: number | string) => api<RaceTrack>(`/events/tracks/${id}/`, { auth: false });

// Con token si hay sesión, para saber si la sigo.
export const getEvent = (slug: string) => api<EventDetail>(`/events/${encodeURIComponent(slug)}/`);

export const setFollowing = (slug: string, follow: boolean) =>
  api<{ following: boolean; followers_count: number }>(`/events/${encodeURIComponent(slug)}/follow/`, {
    method: follow ? 'POST' : 'DELETE',
  });

export const getEventMedia = (slug: string, page = 1) =>
  api<Page<EventMedia>>(`/events/${encodeURIComponent(slug)}/media/?page=${page}`, { auth: false });
