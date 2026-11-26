import { Platform } from 'react-native';

import { colors } from '@/theme';

/**
 * Estilos globales de la versión web que React Native no maneja: barras de desplazamiento finas
 * con los colores de la app (en lugar de las blancas del navegador). En iOS y Android no hace nada.
 */
export function applyWebStyles() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('msail-web-styles')) return;
  const style = document.createElement('style');
  style.id = 'msail-web-styles';
  style.textContent = `
    * { scrollbar-width: thin; scrollbar-color: ${colors.border} transparent; }
    *:hover { scrollbar-color: ${colors.primary}99 transparent; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 999px; }
    ::-webkit-scrollbar-thumb:hover { background: ${colors.primary}; }
    ::-webkit-scrollbar-button { display: none; height: 0; width: 0; }
    ::-webkit-scrollbar-corner { background: transparent; }
    html, body { background: ${colors.background}; color-scheme: dark; }
  `;
  document.head.appendChild(style);

  // Ícono de la pestaña con nombre propio (public/): así el navegador no se queda con uno viejo que tenía guardado.
  for (const [rel, href, sizes] of [
    ['icon', '/favicon-velas.png', '192x192'],
    ['apple-touch-icon', '/apple-touch-icon-velas.png', '180x180'],
  ]) {
    document.head.querySelectorAll(`link[rel="${rel}"]`).forEach((link) => link.remove());
    const link = document.createElement('link');
    link.rel = rel;
    link.type = 'image/png';
    link.sizes.value = sizes;
    link.href = href;
    document.head.appendChild(link);
  }

  // Celulares: sin zoom de la página (pellizco ni doble toque); el zoom es del planeta.
  let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport) {
    viewport = document.createElement('meta');
    viewport.name = 'viewport';
    document.head.appendChild(viewport);
  }
  viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
}
