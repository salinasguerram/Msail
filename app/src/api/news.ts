import { api } from '@/api/client';

export type ArticleCard = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  cover: string | null;
  /** Versión liviana de la portada para los listados. */
  cover_thumb: string | null;
  author: string;
  published_at: string;
  highlight: '' | 'day' | 'week';
  country: string | null;
  country_name: string | null;
  event: { slug: string; name: string } | null;
  boat_classes: string[];
  reading_minutes: number;
};

export type ArticleDetail = ArticleCard & {
  paragraphs: string[];
  cover_credit: string;
  source_name: string;
  source_url: string;
  related: ArticleCard[];
};

export type FrontPage = {
  /** Portada del día (o la noticia más reciente si hoy no hay una marcada). */
  day: ArticleCard | null;
  /** Destacadas y más leídas de los últimos 7 días. */
  week: ArticleCard[];
  latest: ArticleCard[];
};

type Page<T> = { count: number; next: string | null; results: T[] };

export const getFrontPage = () => api<FrontPage>('/news/front/', { auth: false });

export type NewsFilters = {
  country?: string | null;
  boatClass?: string | null;
  /** Slug de la regata o campeonato. */
  event?: string | null;
  q?: string | null;
};

export type FilterOption = { value: string; label: string; count?: number };
export type NewsFilterOptions = { countries: FilterOption[]; classes: FilterOption[]; events: FilterOption[] };

export function getArticles(page = 1, filters: NewsFilters = {}) {
  const query = new URLSearchParams({ page: String(page) });
  if (filters.country) query.set('country', filters.country);
  if (filters.boatClass) query.set('class', filters.boatClass);
  if (filters.event) query.set('event', filters.event);
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  return api<Page<ArticleCard>>(`/news/?${query}`, { auth: false });
}

/** Solo los países, clases y campeonatos que tienen noticias. */
export const getNewsFilterOptions = () => api<NewsFilterOptions>('/news/filters/', { auth: false });

export const getArticle = (slug: string) => api<ArticleDetail>(`/news/${encodeURIComponent(slug)}/`, { auth: false });
