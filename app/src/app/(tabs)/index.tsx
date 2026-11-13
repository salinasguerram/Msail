import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/components/Brand';
import { Globe } from '@/components/globe/Globe';
import { usePageZoomToGlobe } from '@/components/globe/usePageZoomToGlobe';
import { LayerChips, usePlanet, WindButton, WindControls, ZonePanel, type Planet } from '@/components/globe/PlanetExplorer';
import { HomeCard, RegattaArt, WindArt } from '@/components/HomeCards';
import { NotificationBell } from '@/components/NotificationBell';
import { onHomeReset, useWideWeb } from '@/components/TopBar';
import { colors, fonts, radius, spacing, typography } from '@/theme';

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

// Web ancha: título a la izquierda, planeta en el medio y tarjetas a la derecha (la navegación va en la barra de arriba).
const SIDEBAR_WIDTH = 400;
const CARDS_WIDTH = 360;
/** Altura de la cámara al tocar Explorar: cerca, para ver lo que hay en la zona. */
const EXPLORE_ALTITUDE = 0.75;
const TAB_BAR_ESTIMATE = 64;
const COMPACT_TOP_ESTIMATE = 160;
const COMPACT_BOTTOM_ESTIMATE = 90;

/**
 * Explorar: el planeta es el fondo de toda la pantalla y el contenido flota encima.
 * Arranca centrado y del tamaño del espacio libre; al hacer zoom ocupa todo lo que no tiene nada adelante.
 */
export default function ExploreScreen() {
  const { width, height } = useWindowDimensions();
  // Solo en la web y en pantallas anchas: tres columnas. En iOS/Android (y en la web angosta), en columna.
  const wide = useWideWeb();
  const planet = useExplorePlanet();
  // Web: los gestos de zoom siempre van al planeta, nunca agrandan la página.
  usePageZoomToGlobe();
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    altitude: number;
  } | null>(null);
  // Explorando: se tocó Explorar y se ocultan el botón y las tarjetas para dejarle lugar al planeta.
  const [exploring, setExploring] = useState(false);
  const [reset, setReset] = useState<{ lat: number; lng: number } | null>(null);
  const { clearZone, home, wind: planetWind } = planet;
  const hideWind = planetWind.hide;
  useEffect(
    () =>
      onHomeReset(() => {
        setExploring(false);
        clearZone();
        hideWind();
        setReset({ ...home });
      }),
    [clearZone, hideWind, home],
  );
  const { t } = useTranslation();

  // Tamaño de la pantalla y del contenido que tapa cada borde, para centrar el planeta en el hueco libre.
  // Hasta medir la pantalla de verdad (onLayout) se estima con la ventana menos la barra de pestañas.
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const screen = measured ?? {
    w: width,
    h: Math.max(1, height - TAB_BAR_ESTIMATE),
  };
  const [cover, setCover] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const measure = (key: keyof typeof cover) => (event: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = event.nativeEvent.layout;
    const value =
      key === 'left' ? Math.round(x + w) : key === 'right' ? Math.round(screen.w - x) : key === 'top' ? Math.round(y + h) : Math.round(screen.h - y);
    setCover((current) => (current[key] === value ? current : { ...current, [key]: value }));
  };

  // Hasta medir el contenido, se estima lo que ocupa (columna de la izquierda o bloques de arriba y abajo).
  const left = wide ? cover.left || SIDEBAR_WIDTH + spacing.xxl * 2 : 0;
  const right = wide && !exploring ? cover.right || CARDS_WIDTH + spacing.xxl : 0;
  const top = wide ? 0 : cover.top || COMPACT_TOP_ESTIMATE;
  const bottom = wide ? 0 : cover.bottom || COMPACT_BOTTOM_ESTIMATE;
  const freeW = Math.max(1, screen.w - left - right);
  const freeH = Math.max(1, screen.h - top - bottom);
  // El lienzo cubre la pantalla; el planeta se corre (suave) hasta el centro del hueco libre.
  const cx = left + freeW / 2;
  const cy = top + freeH / 2;

  return (
    <View
      style={styles.root}
      onLayout={(e) =>
        setMeasured({
          w: Math.round(e.nativeEvent.layout.width),
          h: Math.round(e.nativeEvent.layout.height),
        })
      }
    >
      {screen.w > 0 ? (
        <Globe
          points={planet.points}
          layers={planet.layers}
          selected={planet.zone}
          wind={planet.wind.cells}
          home={planet.home}
          focus={focus}
          reset={reset}
          frame={{ ...(wide ? { w: screen.h, h: screen.h } : { w: freeW, h: freeH }), dx: cx - screen.w / 2, dy: cy - screen.h / 2 }}
          onTap={planet.onTap}
          onCountry={planet.onCountry}
          style={{ position: 'absolute', left: 0, top: 0, width: screen.w, height: screen.h }}
          accessibilityLabel={t('planet.label')}
        />
      ) : null}

      {wide ? (
        <WideOverlay
          planet={planet}
          onSidebar={measure('left')}
          onCards={measure('right')}
          exploring={exploring}
          onExplore={() => {
            setExploring(true);
            setFocus({ ...planet.home, altitude: EXPLORE_ALTITUDE });
          }}
        />
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

/** Próxima regata (o en curso) de las que hay en el planeta, para el subtítulo de la tarjeta. */
/** Aparece de a poco (al volver al inicio, para que el botón y las tarjetas no salten de golpe). */
function FadeIn({ children, delay = 0, gap }: { children: ReactNode; delay?: number; gap?: number }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 700, delay, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [opacity, delay]);
  return <Animated.View style={{ opacity, gap }}>{children}</Animated.View>;
}

function useNextRegatta(planet: Planet) {
  return useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const events = planet.points.filter((p) => p.kind === 'event' && (p.live || (p.date && p.date >= today)));
    events.sort((a, b) => Number(b.live) - Number(a.live) || (a.date ?? '').localeCompare(b.date ?? ''));
    return events[0] ?? null;
  }, [planet.points]);
}

/** Web ancha: título y capas a la izquierda, el planeta en el medio (detrás) y tarjetas a la derecha. */
function WideOverlay({
  planet,
  onSidebar,
  onCards,
  exploring,
  onExplore,
}: {
  planet: Planet;
  onSidebar: (e: LayoutChangeEvent) => void;
  onCards: (e: LayoutChangeEvent) => void;
  exploring: boolean;
  onExplore: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const next = useNextRegatta(planet);
  const titleSize = width >= 1400 ? 50 : width >= 1200 ? 44 : 38;
  const cardHeight = Math.max(170, Math.min(250, Math.round((height - 68 - 3 * spacing.xl) / 2)));
  return (
    <View style={[StyleSheet.absoluteFill, styles.wideRow]} pointerEvents="box-none">
      <View style={styles.sidebar} onLayout={onSidebar}>
        <Text style={[styles.wideTitle, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.12) }]}>
          {t('explore.heroTitle')} {t('explore.heroAccent')}
        </Text>
        <Text style={[typography.body, styles.shadow, { color: colors.textMuted, fontSize: 16, lineHeight: 24 }]}>{t('explore.heroSubtitle')}</Text>
        {exploring ? null : (
          <FadeIn delay={300}>
            <Pressable
              accessibilityRole="button"
              onPress={onExplore}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.cta,
                (pressed || hovered) && {
                  backgroundColor: colors.primaryPressed,
                },
              ]}
            >
              <Text style={styles.ctaText}>{t('explore.cta')}</Text>
              <Ionicons name="arrow-forward" size={22} color="#fff" />
            </Pressable>
          </FadeIn>
        )}
        <View style={styles.layersRow}>
          <LayerChips planet={planet} />
          <WindButton planet={planet} />
        </View>
        <WindControls planet={planet} />
        {planet.zone ? (
          <ZonePanel planet={planet} maxHeight={Math.max(200, height - 560)} />
        ) : (
          <Text style={[styles.hint, styles.shadow, { textAlign: 'left' }]}>{t('planet.hint')}</Text>
        )}
      </View>
      {/* Hueco del planeta: deja pasar los gestos. */}
      <View style={styles.free} pointerEvents="box-none" />
      {exploring ? null : (
        <View style={styles.cards} onLayout={onCards}>
          <FadeIn delay={500} gap={spacing.xl}>
            <HomeCard
              icon="calendar-outline"
              title={t('explore.regattasCard')}
              subtitle={next ? t('explore.nextRegatta', { name: next.name }) : t('explore.regattasCardText')}
              art={<RegattaArt />}
              height={cardHeight}
              onPress={() => router.navigate('/races')}
            />
            <HomeCard
              icon="cloud-outline"
              title={t('explore.weatherCard')}
              subtitle={t('explore.weatherCardText')}
              art={<WindArt />}
              height={cardHeight}
              onPress={() => router.navigate('/weather')}
            />
          </FadeIn>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
  compactTop: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  compactBottom: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  free: { flex: 1 },
  freeTop: { position: 'absolute', top: spacing.sm, right: spacing.lg },
  freeBottom: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.sm,
    alignItems: 'flex-start',
  },
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
  tileText: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  wideRow: { flexDirection: 'row' },
  sidebar: {
    width: SIDEBAR_WIDTH + spacing.xxl * 2,
    gap: spacing.lg,
    paddingLeft: spacing.xxl * 2,
    paddingVertical: spacing.lg,
    justifyContent: 'center',
  },
  wideTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(5,11,24,0.9)',
    textShadowRadius: 14,
  },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl + 4,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    marginVertical: spacing.sm,
  },
  layersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ctaText: { color: '#fff', fontFamily: fonts.heading, fontSize: 19 },
  cards: {
    width: CARDS_WIDTH + spacing.xxl,
    paddingRight: spacing.xxl,
    gap: spacing.xl,
    justifyContent: 'center',
  },
});
