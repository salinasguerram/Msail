import type { StyleProp, ViewStyle } from 'react-native';

import type { MapKind, MapPoint } from '@/api/map';

/** Lo que el planeta le avisa a la app cuando se toca algo. */
export type GlobeTap = {
  lat: number;
  lng: number;
  /** Id del punto tocado, si se tocó un pin (si no, se tocó el planeta). */
  pointId: string | null;
};

/** Punto listo para el planeta: con su mini resumen ya escrito en el idioma de la app. */
export type GlobePoint = MapPoint & { typeLabel: string; summary: string };

/** Celda de la grilla de viento para la hora elegida. */
export type WindCell = { lat: number; lng: number; speed: number | null; direction: number | null };

export type GlobeProps = {
  points: GlobePoint[];
  /** Capas visibles. */
  layers: Record<MapKind, boolean>;
  /** Zona elegida: se marca con un anillo, se resalta el país y la cámara va hacia ahí. */
  selected: { lat: number; lng: number; pointId: string | null; iso?: string | null } | null;
  /** Capa de viento (null: apagada). */
  wind: WindCell[] | null;
  /** Ubicación aproximada de la persona: el planeta arranca centrado ahí. */
  home?: { lat: number; lng: number } | null;
  /** Vuelo de la cámara hacia un lugar (botón Explorar). Cada objeto nuevo dispara un vuelo. */
  focus?: { lat: number; lng: number; altitude: number } | null;
  /** Cada objeto nuevo vuelve el planeta a la vista inicial, centrado en ese lugar. */
  reset?: { lat: number; lng: number } | null;
  /** Tamaño del espacio libre (px) cuando el planeta es el fondo de una pantalla con contenido encima. */
  frame?: { w: number; h: number; dx?: number; dy?: number } | null;
  onTap: (tap: GlobeTap) => void;
  /** País de la zona elegida, en el idioma de la app (null si se tocó el mar). */
  onCountry?: (country: { name: string | null; iso: string | null }) => void;
  style?: StyleProp<ViewStyle>;
  /** Etiqueta para lectores de pantalla. */
  accessibilityLabel?: string;
};

/** Mensajes de la app al planeta. */
export type ToGlobe =
  | { type: 'points'; points: GlobePoint[]; layers: Record<MapKind, boolean> }
  | { type: 'select'; lat: number; lng: number; pointId: string | null; iso?: string | null }
  | { type: 'clear' }
  | { type: 'wind'; cells: WindCell[] | null }
  | { type: 'home'; lat: number; lng: number }
  | { type: 'fly'; lat: number; lng: number; altitude: number }
  | { type: 'reset'; lat: number; lng: number }
  | { type: 'frame'; w: number; h: number; dx: number; dy: number };

/** Mensajes del planeta a la app. */
export type FromGlobe =
  | { type: 'ready' }
  | ({ type: 'tap' } & GlobeTap)
  | { type: 'country'; name: string | null; iso: string | null }
  | { type: 'error'; message: string };
