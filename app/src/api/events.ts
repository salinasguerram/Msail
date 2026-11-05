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
};

type Page<T> = { count: number; next: string | null; results: T[] };

function monthRange(month: string) {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(year, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function getEvents(filters: EventFilters, page = 1) {
  const query = new URLSearchParams({ when: filters.when, page: String(page) });
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
