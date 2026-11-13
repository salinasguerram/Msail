import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';

import { zoomGlobe } from './zoom';

/** ¿Hay algo que se pueda desplazar en esa dirección (ej. la lista de una zona)? Ahí la rueda desplaza, no hace zoom. */
function canScroll(target: EventTarget | null, deltaY: number) {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      if (deltaY < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Web: mientras la pantalla está a la vista, los gestos de zoom (Ctrl + rueda, pellizco en el trackpad o con dos
 * dedos) no agrandan la página: hacen zoom en el planeta, aunque empiecen sobre el texto o los botones.
 */
export function usePageZoomToGlobe() {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') return undefined;

      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey && canScroll(e.target, e.deltaY)) return;
        e.preventDefault();
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        // El pellizco del trackpad llega como Ctrl + rueda con pasos chicos: se amplifica.
        zoomGlobe(Math.exp(delta * (e.ctrlKey ? 0.01 : 0.0015)));
      };

      let last = 0;
      const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      const onTouchStart = (e: TouchEvent) => {
        last = e.touches.length === 2 ? distance(e.touches) : 0;
      };
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 2) return;
        e.preventDefault();
        const d = distance(e.touches);
        if (last && d) zoomGlobe(last / d);
        last = d;
      };
      // Safari (iPhone/iPad) hace zoom de la página con sus propios eventos de gesto.
      const block = (e: Event) => e.preventDefault();

      const options = { passive: false } as const;
      window.addEventListener('wheel', onWheel, options);
      window.addEventListener('touchstart', onTouchStart, options);
      window.addEventListener('touchmove', onTouchMove, options);
      window.addEventListener('gesturestart', block, options);
      window.addEventListener('gesturechange', block, options);
      return () => {
        window.removeEventListener('wheel', onWheel);
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('gesturestart', block);
        window.removeEventListener('gesturechange', block);
      };
    }, []),
  );
}
