import { api } from '@/api/client';

export type MsailingSectionKey = 'about' | 'school' | 'foundation';

/** Texto de una parte de la página (ya en el idioma de la app). */
export type MsailingSection = {
  key: MsailingSectionKey;
  title: string;
  /** Párrafos separados por una línea en blanco. */
  body: string;
  image: string | null;
  /** Botón opcional (ej. "Quiero colaborar" → mailto:…). */
  cta_label: string;
  cta_url: string;
};

export type MsailingVideo = {
  id: number;
  title: string;
  description: string;
  url: string;
  kind: 'video' | 'tip';
  language: 'es' | 'en';
  /** Miniatura de YouTube (null en otras plataformas). */
  thumbnail: string | null;
};

export type FoundationSupport = {
  id: number;
  beneficiary: string;
  purpose: string;
  description: string;
  amount: number | null;
  currency: string;
  date: string;
  photo: string | null;
};

export type MsailingPage = {
  sections: Partial<Record<MsailingSectionKey, MsailingSection>>;
  videos: MsailingVideo[];
  foundation: {
    supports: FoundationSupport[];
    /** Total aportado por moneda. */
    totals: { currency: string; total: number }[];
    /** Deportistas o equipos apoyados. */
    athletes: number;
  };
};

export const getMsailing = () => api<MsailingPage>('/msailing/', { auth: false });
