import { api } from '@/api/client';
import { currentLanguage } from '@/i18n';

export type Country = { iso_code: string; name: string; continent: string };
export type Region = { id: number; name: string; slug: string; country: string };
export type Club = { id: number; name: string; slug: string; city: string; country: string; is_verified: boolean };

// Los nombres de países y regiones vienen en el idioma de la app: se cachean por idioma.
const countryCache = new Map<string, Promise<Country[]>>();

export function getCountries() {
  const language = currentLanguage();
  if (!countryCache.has(language)) {
    countryCache.set(
      language,
      api<Country[]>('/countries/', { auth: false }).catch((error) => {
        countryCache.delete(language);
        throw error;
      }),
    );
  }
  return countryCache.get(language)!;
}

export const getRegions = (country: string) => api<Region[]>(`/regions/?country=${encodeURIComponent(country)}`, { auth: false });

export const searchClubs = (params: { search?: string; country?: string | null }) => {
  const query = new URLSearchParams();
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.country) query.set('country', params.country);
  return api<{ results: Club[] }>(`/clubs/?${query}`, { auth: false }).then((page) => page.results);
};
