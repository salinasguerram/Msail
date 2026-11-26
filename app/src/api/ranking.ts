import { api } from '@/api/client';

export type Division = 'open' | 'women' | 'u15' | 'u17' | 'u19' | 'u21' | 'master';
export type RankingLevel = 'club' | 'regional' | 'national' | 'continental' | 'world';
export type BoatCategory = 'dinghy' | 'keelboat' | 'multihull' | 'offshore' | 'foiling' | 'board';

export type RankingOptions = {
  /** Temporada que conviene mostrar (la actual o la última con resultados). */
  season: number;
  seasons: number[];
  /** Clases con resultados en la temporada, las más concurridas primero. */
  classes: { slug: string; name: string; category: BoatCategory; divisions: Division[]; competitors: number }[];
  countries: { iso: string; name: string }[];
  rules: { best_of: number; min_fleet: number; levels: { key: RankingLevel; coefficient: number }[] };
};

export type RankingResult = {
  event: { slug: string; name: string; date: string };
  category: string | null;
  /** null si no terminó (DNF, DNS...). */
  position: number | null;
  status: string;
  fleet: number;
  level: RankingLevel;
  coefficient: number;
  points: number;
  /** Está entre los mejores resultados que suman. */
  counted: boolean;
};

export type RankingEntry = {
  key: string;
  rank: number;
  name: string;
  boat_name: string;
  sail_number: string;
  country: string | null;
  country_name: string | null;
  /** Navegante de MSAIL (si el barco está enlazado a su ficha). */
  sailor: { user_id: number; avatar: string | null } | null;
  points: number;
  events: number;
  /** Puestos que subió (+) o bajó (−) en los últimos 30 días; null si no estaba. */
  movement: number | null;
  is_new: boolean;
  results: RankingResult[];
};

export const getRankingOptions = (season?: number) =>
  api<RankingOptions>(`/ranking/options/${season ? `?season=${season}` : ''}`, { auth: false });

export function getRanking(params: { season: number; boatClass: string; division: Division; country: string | null }) {
  const query = new URLSearchParams({ season: String(params.season), class: params.boatClass, division: params.division });
  if (params.country) query.set('country', params.country);
  return api<{ entries: RankingEntry[] }>(`/ranking/?${query}`, { auth: false });
}
