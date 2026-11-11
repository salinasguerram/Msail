import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/components/Brand';
import { Globe } from '@/components/globe/Globe';
import { LayerChips, usePlanet, WindButton, WindControls, ZonePanel, type Planet } from '@/components/globe/PlanetExplorer';
import { NotificationBell } from '@/components/NotificationBell';
import { colors, radius, spacing, typography } from '@/theme';

type Shortcut = {
  key: 'marinas' | 'professionals' | 'learning';
  icon: ComponentProps<typeof Ionicons>['name'];
  href: Href;
};

// Regatas, Noticias y Clima ya están en la barra de abajo: acá van solo las secciones sin pestaña.
const SHORTCUTS: Shortcut[] = [
  { key: 'marinas', icon: 'boat-outline', href: '/marinas' },
  { key: 'professionals', icon: 'construct-outline', href: '/professionals' },
  { key: 'learning', icon: 'school-outline', href: '/learning' },
];

/** Desde este ancho, en la web, la home pasa a dos columnas: menú a la izquierda y el planeta a la derecha. */
const WIDE_WEB_MIN = 900;
const SIDEBAR_WIDTH = 360;
const TAB_BAR_ESTIMATE = 64;
const COMPACT_TOP_ESTIMATE = 160;
const COMPACT_BOTTOM_ESTIMATE = 90;

/**
 * Explorar: el planeta es el fondo de toda la pantalla y el contenido flota encima.
 * Arranca centrado y del tamaño del espacio libre; al hacer zoom ocupa todo lo que no tiene nada adelante.
 */
export default function ExploreScreen() {
  const { width, height } = useWindowDimensions();
  // Solo en la web y en pantallas anchas: menú a la izquierda. En iOS/Android (y en la web angosta), en columna.
  const wide = Platform.OS === 'web' && width >= WIDE_WEB_MIN;
  const planet = useExplorePlanet();
  const { t } = useTranslation();

  // Tamaño de la pantalla y del contenido que tapa cada borde, para centrar el planeta en el hueco libre.
  // Hasta medir la pantalla de verdad (onLayout) se estima con la ventana menos la barra de pestañas.
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const screen = measured ?? { w: width, h: Math.max(1, height - TAB_BAR_ESTIMATE) };
  const [cover, setCover] = useState({ left: 0, top: 0, bottom: 0 });
  const measure = (key: keyof typeof cover) => (event: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = event.nativeEvent.layout;
    const value = key === 'left' ? Math.round(x + w) : key === 'top' ? Math.round(y + h) : Math.round(screen.h - y);
    setCover((current) => (current[key] === value ? current : { ...current, [key]: value }));
  };

  // Hasta medir el contenido, se estima lo que ocupa (columna de la izquierda o bloques de arriba y abajo).
  const left = wide ? cover.left || SIDEBAR_WIDTH + spacing.xxl : 0;
  const top = wide ? 0 : cover.top || COMPACT_TOP_ESTIMATE;
  const bottom = wide ? 0 : cover.bottom || COMPACT_BOTTOM_ESTIMATE;
  const freeW = Math.max(1, screen.w - left);
  const freeH = Math.max(1, screen.h - top - bottom);
  // El lienzo cubre toda la pantalla y tiene su centro en el centro del hueco libre (se recorta lo que sobra).
  const cx = left + freeW / 2;
  const cy = top + freeH / 2;
  const canvasW = 2 * Math.max(cx, screen.w - cx);
  const canvasH = 2 * Math.max(cy, screen.h - cy);

  return (
    <View
      style={styles.root}
      onLayout={(e) => setMeasured({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}
    >
      {screen.w > 0 ? (
        <Globe
          points={planet.points}
          layers={planet.layers}
          selected={planet.zone}
          wind={planet.wind.cells}
          home={planet.home}
          frame={{ w: freeW, h: freeH }}
          onTap={planet.onTap}
          onCountry={planet.onCountry}
          style={{ position: 'absolute', left: cx - canvasW / 2, top: cy - canvasH / 2, width: canvasW, height: canvasH }}
          accessibilityLabel={t('planet.label')}
        />
      ) : null}

      {wide ? (
        <WideOverlay planet={planet} onSidebar={measure('left')} />
      ) : (
        <CompactOverlay planet={planet} onTop={measure('top')} onBottom={measure('bottom')} height={screen.h} />
      )}
    </View>
  );
}

/** ?wind=1 (desde la pestaña Clima) abre el planeta con la capa de viento prendida. */
function useExplorePlanet() {
  const { wind } = useLocalSearchParams<{ wind?: string }>();
  const planet = usePlanet({ initialWind: wind === '1' });
  // Explorar queda montado en su pestaña: si se vuelve desde Clima, se prende el viento igual.
  const { show } = planet.wind;
  useEffect(() => {
    if (wind === '1') show();
  }, [wind, show]);
  return planet;
}

function Hero({ titleSize = 32, compact = false }: { titleSize?: number; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.hero, compact && { gap: 2 }]}>
      <Text style={[styles.heroTitle, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.18) }]}>
        {t('explore.heroTitle')}
        {compact ? ' ' : '\n'}
        <Text style={{ color: colors.primary }}>{t('explore.heroAccent')}</Text>
      </Text>
      <Text style={[typography.body, styles.shadow, { color: colors.textMuted }, compact && styles.heroSubtitleCompact]}>
        {t('explore.heroSubtitle')}
      </Text>
    </View>
  );
}

/** Hueco libre por donde pasan los gestos al planeta, con el botón y los controles del viento. */
function FreeArea({ planet, children }: { planet: Planet; children?: ReactNode }) {
  return (
    <View style={styles.free} pointerEvents="box-none">
      <View style={styles.freeTop} pointerEvents="box-none">
        <WindButton planet={planet} />
      </View>
      {children}
      <View style={styles.freeBottom} pointerEvents="box-none">
        <WindControls planet={planet} />
      </View>
    </View>
  );
}

/** Celular (y web angosta): marca, título y capas arriba; accesos y zona abajo; el planeta en el medio y detrás. */
function CompactOverlay({
  planet,
  onTop,
  onBottom,
  height,
}: {
  planet: Planet;
  onTop: (e: LayoutChangeEvent) => void;
  onBottom: (e: LayoutChangeEvent) => void;
  height: number;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[StyleSheet.absoluteFill, { paddingTop: insets.top }]} pointerEvents="box-none">
      <View style={styles.compactTop} onLayout={onTop}>
        <View style={styles.brandRow}>
          <Brand size={14} />
          <NotificationBell />
        </View>
        <Hero titleSize={20} compact />
        <LayerChips planet={planet} />
      </View>

      <FreeArea planet={planet} />

      <View style={styles.compactBottom} onLayout={onBottom}>
        {planet.zone ? (
          <ZonePanel planet={planet} maxHeight={Math.max(140, Math.round(height * 0.28))} />
        ) : (
          <Text style={[styles.hint, styles.shadow]}>{t('planet.hint')}</Text>
        )}
        <View style={styles.grid}>
          {SHORTCUTS.map(({ key, icon, href }) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              onPress={() => router.push(href)}
              style={({ pressed }) => [styles.tile, pressed && { borderColor: colors.primary }]}
            >
              <Ionicons name={icon} size={18} color={colors.primary} />
              <Text style={styles.tileText} numberOfLines={2}>
                {t(`explore.${key}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Web ancha: columna con título, capas, zona y menú a la izquierda; el planeta a la derecha y detrás. */
function WideOverlay({ planet, onSidebar }: { planet: Planet; onSidebar: (e: LayoutChangeEvent) => void }) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, styles.wideRow]} pointerEvents="box-none">
      <View style={styles.sidebar} onLayout={onSidebar}>
        <View style={styles.brandRow}>
          <Brand size={20} />
          <NotificationBell />
        </View>
        <Hero titleSize={36} />
        <LayerChips planet={planet} />
        {planet.zone ? (
          <ZonePanel planet={planet} maxHeight={Math.max(240, height - 520)} />
        ) : (
          <Text style={[styles.hint, styles.shadow]}>{t('planet.hint')}</Text>
        )}
        <View style={styles.menu}>
          {SHORTCUTS.map(({ key, icon, href }) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              onPress={() => router.push(href)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.menuItem,
                (pressed || hovered) && { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
              ]}
            >
              <View style={styles.menuIcon}>
                <Ionicons name={icon} size={22} color={colors.primary} />
              </View>
              <Text style={styles.menuText}>{t(`explore.${key}`)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>
      <FreeArea planet={planet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: spacing.sm },
  heroTitle: {
    ...typography.title,
    textTransform: 'uppercase',
    // Sombra suave: el texto se sigue leyendo si el planeta pasa por detrás.
    textShadowColor: 'rgba(5,11,24,0.9)',
    textShadowRadius: 12,
  },
  heroSubtitleCompact: { fontSize: 13, lineHeight: 18 },
  shadow: { textShadowColor: 'rgba(5,11,24,0.95)', textShadowRadius: 8 },
  compactTop: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  compactBottom: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  free: { flex: 1 },
  freeTop: { position: 'absolute', top: spacing.sm, right: spacing.lg },
  freeBottom: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.sm, alignItems: 'flex-start' },
  hint: { ...typography.caption, fontSize: 11, textAlign: 'center' },
  grid: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  tileText: { flexShrink: 1, color: colors.text, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  wideRow: { flexDirection: 'row' },
  sidebar: {
    width: SIDEBAR_WIDTH + spacing.xxl,
    gap: spacing.lg,
    paddingLeft: spacing.xxl,
    paddingVertical: spacing.lg,
    justifyContent: 'center',
  },
  menu: { gap: spacing.sm },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
});
