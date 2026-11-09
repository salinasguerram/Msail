import { api } from '@/api/client';

export type WeatherPlace = {
  /** 'event:<slug>' o 'zone:<id>' */
  id: string;
  kind: 'event' | 'zone';
  /** Sede (ej. "Bahía de Palma") o nombre de la zona. */
  name: string;
  /** Regata (en sedes) o país (en zonas). */
  subtitle: string;
  country_name: string;
  start_date: string | null;
  latitude: number;
  longitude: number;
};

export type ForecastDay = {
  /** AAAA-MM-DD en la hora local del lugar. */
  date: string;
  /** Código WMO del estado del cielo. */
  weather_code: number | null;
  temp_max: number | null;
  temp_min: number | null;
  rain_mm: number | null;
  rain_probability: number | null;
  /** Viento máximo y rachas en nudos; dirección de donde viene, en grados. */
  wind_kn: number | null;
  gusts_kn: number | null;
  wind_direction: number | null;
  /** Olas: null en zonas sin mar. */
  wave_m: number | null;
  wave_direction: number | null;
  wave_period_s: number | null;
};

export type Forecast = {
  place: WeatherPlace;
  timezone: string;
  days: ForecastDay[];
  has_waves: boolean;
  updated_at: string;
  source: { name: string; url: string; license: string };
};

export const getWeatherPlaces = () => api<{ events: WeatherPlace[]; zones: WeatherPlace[] }>('/weather/places/', { auth: false });

export const getForecast = (place: string) =>
  api<Forecast>(`/weather/forecast/?place=${encodeURIComponent(place)}`, { auth: false });

/** Viento en todo el planeta (grilla cada 15°): velocidad en nudos y dirección de donde viene, para cada hora de `offsets`. */
export type WindGrid = {
  /** Hora UTC de cada columna (ahora, +12, +24, +48 h). */
  times: string[];
  offsets: number[];
  points: { lat: number; lng: number; speed: (number | null)[]; direction: (number | null)[] }[];
  source: { name: string; url: string; license: string };
};

export const getWindGrid = () => api<WindGrid>('/weather/wind/', { auth: false });
