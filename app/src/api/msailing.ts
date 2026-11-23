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

export type VideoLevel = 'all' | 'beginner' | 'intermediate' | 'advanced';

/** Contenido educativo: un video, un tip o una lección escrita. */
export type MsailingVideo = {
  id: number;
  title: string;
  description: string;
  /** Vacío si es Premium y el usuario no lo es (o si es una lección sin video). */
  url: string;
  kind: 'video' | 'tip' | 'lesson';
  language: 'es' | 'en';
  /** Miniatura de YouTube (null en otras plataformas). */
  thumbnail: string | null;
  /** Clases para las que es (slugs). Vacío: sirve para todas. */
  boat_classes: string[];
  level: VideoLevel;
  /** Exclusivo de MSAIL Premium. */
  is_premium: boolean;
  /** Tiene texto de lección (se lee en la app). */
  has_lesson: boolean;
  /** Premium y el usuario no lo es: se ve el título y la descripción, con candado. */
  locked: boolean;
};

export type MsailingVideoDetail = MsailingVideo & { body: string };

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

// Con la sesión (si hay): así a los suscriptores Premium les llega el contenido exclusivo.
export const getMsailing = () => api<MsailingPage>('/msailing/');
export const getVideo = (id: number | string) => api<MsailingVideoDetail>(`/msailing/videos/${id}/`);
