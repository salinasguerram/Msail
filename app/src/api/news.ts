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
export const getArticles = (page = 1) => api<Page<ArticleCard>>(`/news/?page=${page}`, { auth: false });
export const getArticle = (slug: string) => api<ArticleDetail>(`/news/${encodeURIComponent(slug)}/`, { auth: false });
