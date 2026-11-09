import { api } from '@/api/client';

export type MapKind = 'event' | 'marina' | 'professional';

/** Punto del planeta 3D (regata en curso o próxima, marina o profesional). */
export type MapPoint = {
  /** 'event:<slug>', 'marina:<slug>' o 'professional:<slug>' */
  id: string;
  kind: MapKind;
  slug: string;
  name: string;
  /** Lugar (regatas y marinas) o especialidades (profesionales). */
  subtitle: string;
  /** Inicio (solo regatas), AAAA-MM-DD. */
  date: string | null;
  /** Regata en curso. */
  live: boolean;
  /** País (ISO y nombre en el idioma de la app). */
  country: string;
  country_name: string;
  lat: number;
  lng: number;
  // Datos para el mini resumen del pin (según el tipo).
  end_date?: string | null;
  event_type?: string;
  max_length_m?: number | null;
  berths?: number | null;
  services?: number;
  city?: string;
  rating?: number | null;
  reviews_count?: number;
};

export const getMapPoints = () =>
  api<{ points: MapPoint[]; counts: Record<MapKind, number> }>('/map/points/', { auth: false });
