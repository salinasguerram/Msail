import { useSyncExternalStore } from 'react';

/**
 * Alto de la barra de navegación (pestañas de abajo en el celular, barra de arriba en la web ancha).
 * En Explorar el planeta va encima de las pantallas pero debajo de esa barra, así que necesita saber cuánto ocupa.
 */
let height = 0;
const listeners = new Set<() => void>();

export function setNavBarHeight(next: number) {
  const rounded = Math.round(next);
  if (rounded === height) return;
  height = rounded;
  listeners.forEach((listener) => listener());
}

export function useNavBarHeight() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => height,
    () => height,
  );
}
