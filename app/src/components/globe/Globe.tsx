import { useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { colors } from '@/theme';

import { globeHtml } from './globeHtml';
import type { FromGlobe, GlobeProps, ToGlobe } from './types';
import { onGlobeZoom } from './zoom';

// Los tipos de WebView (componente de clase) no encajan con los de esta versión de React: se tipa a mano.
const WebViewView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

/** Planeta 3D en iOS y Android: la página de globe.gl dentro de un WebView. La versión web está en Globe.web.tsx. */
export function Globe({ points, layers, selected, wind, home, focus, reset, idle, frame, onTap, onCountry, style, accessibilityLabel }: GlobeProps) {
  const { i18n } = useTranslation();
  const webview = useRef<WebView>(null);
  // Sube cada vez que la página avisa que está lista (también después de recargarse): ahí se le manda todo.
  const [ready, setReady] = useState(0);
  const html = useMemo(() => globeHtml({ background: colors.background, language: i18n.language }), [i18n.language]);

  function send(msg: ToGlobe) {
    webview.current?.injectJavaScript(`window.msail && window.msail.receive(${JSON.stringify(msg)}); true;`);
  }

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

  // El espacio libre va antes que la ubicación: así el centrado inicial ya usa el zoom correcto.
  const frameW = frame?.w ?? 0;
  const frameH = frame?.h ?? 0;
  const frameDx = Math.round(frame?.dx ?? 0);
  const frameDy = Math.round(frame?.dy ?? 0);
  useEffect(() => {
    if (ready && frameW > 0 && frameH > 0) send({ type: 'frame', w: frameW, h: frameH, dx: frameDx, dy: frameDy });
  }, [ready, frameW, frameH, frameDx, frameDy]);

  useEffect(() => {
    if (ready && home) send({ type: 'home', lat: home.lat, lng: home.lng });
  }, [ready, home]);

  useEffect(() => {
    if (ready && focus) send({ type: 'fly', lat: focus.lat, lng: focus.lng, altitude: focus.altitude });
  }, [ready, focus]);

  // Fondo de las otras secciones (va después del efecto de frame: primero cambia el tamaño, después la vista).
  useEffect(() => {
    if (ready) send({ type: 'idle', on: !!idle });
  }, [ready, idle]);

  // Zoom pedido desde afuera (gestos sobre lo que está encima del planeta).
  useEffect(() => (ready ? onGlobeZoom((factor) => send({ type: 'zoom', factor })) : undefined), [ready]);

  useEffect(() => {
    if (ready && reset) send({ type: 'reset', lat: reset.lat, lng: reset.lng });
  }, [ready, reset]);

  function onMessage(event: WebViewMessageEvent) {
    let msg: FromGlobe;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') setReady((n) => n + 1);
    else if (msg.type === 'tap') onTap({ lat: msg.lat, lng: msg.lng, pointId: msg.pointId });
    else if (msg.type === 'country') onCountry?.({ name: msg.name, iso: msg.iso });
  }

  return (
    // Sin `accessible`: en iOS agruparía la vista y el WebView dejaría de recibir los gestos.
    <View style={style} accessibilityLabel={accessibilityLabel}>
      <WebViewView
        ref={webview}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onMessage}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: colors.background }}
      />
    </View>
  );
}
