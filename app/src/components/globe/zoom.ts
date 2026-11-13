/** Canal para hacer zoom en el planeta desde afuera (rueda o pellizco sobre lo que está encima del planeta). */
const listeners = new Set<(factor: number) => void>();

/** factor < 1 acerca, > 1 aleja (multiplica la altura de la cámara). */
export function zoomGlobe(factor: number) {
  listeners.forEach((listener) => listener(factor));
}

export function onGlobeZoom(listener: (factor: number) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
