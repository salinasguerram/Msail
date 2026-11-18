import { useSyncExternalStore } from 'react';

import type { FieldCell } from '@/components/globe/types';

/**
 * Hacia dónde mira el planeta en cada pantalla que lo muestra de cerca (Clima, Eventos, Servicios).
 * Cada pantalla guarda su enfoque bajo su ruta; la capa del planeta (PlanetLayer) usa el de la ruta abierta.
 */
export type PlanetFocus = {
  lat: number;
  lng: number;
  /** Altura de la cámara (más chica = más cerca). */
  altitude: number;
  /** Dónde queda el lugar en la pantalla: fracción del alto hacia arriba desde el centro (0.3 = bastante arriba). */
  raise: number;
  /** Clima marino: viento, olas o corriente dibujados sobre el planeta. */
  field?: { kind: 'wind' | 'waves' | 'currents'; step: number; cells: FieldCell[] } | null;
};

let focuses: Record<string, PlanetFocus> = {};
const listeners = new Set<() => void>();

export function setPlanetFocus(route: string, focus: PlanetFocus | null) {
  const next = { ...focuses };
  if (focus) next[route] = focus;
  else delete next[route];
  focuses = next;
  listeners.forEach((listener) => listener());
}

export function usePlanetFocuses() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => focuses,
    () => focuses,
  );
}
