import { api } from '@/api/client';

export const EVENT_TYPES = ['offshore', 'inshore', 'one_design', 'olympic', 'multihull', 'youth'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type EventStatus = 'upcoming' | 'live' | 'finished';
export type EventWhen = 'upcoming' | 'live' | 'past';

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
  const query = new URLSearchParams({ when: filters.when, page: String(page) });
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
  return api<Page<EventSummary>>(`/events/?${query}`, { auth: false });
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
};

export const getEvent = (slug: string) => api<EventDetail>(`/events/${encodeURIComponent(slug)}/`, { auth: false });

export const getEventMedia = (slug: string, page = 1) =>
  api<Page<EventMedia>>(`/events/${encodeURIComponent(slug)}/media/?page=${page}`, { auth: false });
