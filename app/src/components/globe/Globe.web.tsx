import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { colors } from '@/theme';

import { globeHtml } from './globeHtml';
import type { FromGlobe, GlobeProps, ToGlobe } from './types';

/** Planeta 3D en la web: la misma página de globe.gl, dentro de un iframe aislado (sin acceso a la app). */
export function Globe({ points, layers, selected, wind, onTap, onCountry, style, accessibilityLabel }: GlobeProps) {
  const { i18n } = useTranslation();
  const frame = useRef<HTMLIFrameElement | null>(null);
  // Sube cada vez que la página avisa que está lista (también después de recargarse): ahí se le manda todo.
  const [ready, setReady] = useState(0);
  const html = useMemo(() => globeHtml({ background: colors.background, language: i18n.language }), [i18n.language]);
  const callbacks = useRef({ onTap, onCountry });
  useEffect(() => {
    callbacks.current = { onTap, onCountry };
  }, [onTap, onCountry]);

  function send(msg: ToGlobe) {
    frame.current?.contentWindow?.postMessage({ target: 'msail-globe', msg }, '*');
  }

  // Solo se aceptan mensajes del iframe del planeta.
  useEffect(() => {
    function listen(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== 'msail-globe') return;
      const msg = event.data.msg as FromGlobe;
      if (msg.type === 'ready') setReady((n) => n + 1);
      else if (msg.type === 'tap') callbacks.current.onTap({ lat: msg.lat, lng: msg.lng, pointId: msg.pointId });
      else if (msg.type === 'country') callbacks.current.onCountry?.({ name: msg.name, iso: msg.iso });
    }
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);

  useEffect(() => {
    if (ready) send({ type: 'points', points, layers });
  }, [ready, points, layers]);

  useEffect(() => {
    if (!ready) return;
    send(selected ? { type: 'select', ...selected } : { type: 'clear' });
  }, [ready, selected]);

  useEffect(() => {
    if (ready) send({ type: 'wind', cells: wind });
  }, [ready, wind]);

  return (
    <View style={style} accessibilityLabel={accessibilityLabel}>
      {createElement('iframe', {
        key: i18n.language,
        ref: frame,
        srcDoc: html,
        title: accessibilityLabel,
        // allow-scripts sin allow-same-origin: el planeta no puede leer nada de la app.
        sandbox: 'allow-scripts',
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: colors.background },
      })}
    </View>
  );
}
