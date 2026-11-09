import { useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { colors } from '@/theme';

import { globeHtml } from './globeHtml';
import type { FromGlobe, GlobeProps, ToGlobe } from './types';

// Los tipos de WebView (componente de clase) no encajan con los de esta versión de React: se tipa a mano.
const WebViewView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

/** Planeta 3D en iOS y Android: la página de globe.gl dentro de un WebView. La versión web está en Globe.web.tsx. */
export function Globe({ points, layers, selected, wind, onTap, onCountry, style, accessibilityLabel }: GlobeProps) {
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
