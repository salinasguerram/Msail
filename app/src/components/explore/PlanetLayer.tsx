import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/components/Brand';
import { Globe } from '@/components/globe/Globe';
import { usePageZoomToGlobe } from '@/components/globe/usePageZoomToGlobe';
import { usePlanetFocuses } from './planetFocus';
import { useNavBarHeight } from './navBar';
import { LayerChips, usePlanet, WindButton, WindControls, ZonePanel, type Planet } from '@/components/globe/PlanetExplorer';
import { NotificationBell } from '@/components/NotificationBell';
import { NewsCard, TodayFeed, useTodayFeed, type FeedItem } from '@/components/TodayFeed';
import { WeatherCard, WeatherChip } from '@/components/WeatherChip';
import { onHomeReset, useWideWeb, TOP_BAR_HEIGHT } from '@/components/TopBar';
import { colors, fonts, radius, spacing, typography } from '@/theme';

// Web ancha: título a la izquierda, planeta en el medio y tarjetas a la derecha (la navegación va en la barra de arriba).
const SIDEBAR_WIDTH = 400;
const CARDS_WIDTH = 360;
/** Altura de la cámara al tocar Explorar: cerca, para ver lo que hay en la zona. */
const EXPLORE_ALTITUDE = 0.75;
const TAB_BAR_ESTIMATE = 64;
/** Oscurece el planeta cuando está de fondo, para que el contenido de la sección se lea bien. */
const BACKGROUND_DIM = 'rgba(5,11,24,0.55)';
/** En Clima marino el planeta es el protagonista: casi sin oscurecer. */
const PLACE_DIM = 'rgba(5,11,24,0.12)';
const COMPACT_TOP_ESTIMATE = 160;
const COMPACT_BOTTOM_ESTIMATE = 90;

/**
 * Planeta de toda la app: se monta una sola vez (en el layout raíz) y se ve siempre.
 * - En Explorar va encima de las pantallas (debajo de la barra de navegación), con el contenido de la home flotando
 *   encima, y se puede girar, tocar y hacer zoom.
 * - En cualquier otra sección queda de fondo: detrás de la pantalla (que es transparente), oscurecido, centrado y
 *   girando despacio. Al volver a Explorar regresa a la vista que tenía.
 */
export function PlanetLayer() {
  const { width, height } = useWindowDimensions();
  const pathname = usePathname();
  const explore = pathname === '/';
  const navBar = useNavBarHeight();
  // Pantallas que muestran el planeta de cerca (Clima, Eventos, Servicios): se acerca al lugar que piden.
  const focuses = usePlanetFocuses();
  const place = explore ? null : (focuses[pathname] ?? null);
  const field = place?.field ?? null;
  // Web: el zoom nunca agranda la página; va al planeta en Explorar y en las pantallas que lo muestran de cerca.
  usePageZoomToGlobe(explore ? 'explore' : place ? 'place' : 'block');
  // Solo en la web y en pantallas anchas: tres columnas. En iOS/Android (y en la web angosta), en columna.
  const wide = useWideWeb();
  const planet = useExplorePlanet();
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
  // "Hoy en la vela": noticias y campeonatos en curso alrededor del planeta (ya no es una sección aparte).
  const feed = useTodayFeed();
  const pointOf = (eventSlug: string) => planet.points.find((p) => p.id === `event:${eventSlug}`);
  // Ubicar en el planeta: solo para campeonatos que están en el mapa (las tarjetas de los demás no muestran el botón).
  const locate = (eventSlug: string) => {
    const point = pointOf(eventSlug);
    if (point) planet.goTo(point);
  };
  const canLocate = (eventSlug: string) => !!pointOf(eventSlug);

  // En Explorar deja libre la barra de navegación (abajo en el celular, arriba en la web ancha).
  const bar = navBar || (wide ? TOP_BAR_HEIGHT : TAB_BAR_ESTIMATE);
  // Tamaño de la capa: la ventana menos la barra (en Explorar). Se calcula de la ventana y no se mide con onLayout:
  // al pasar de la vista ancha a la de celular (o al girar), la medición a veces llegaba tarde y el planeta quedaba
  // con el tamaño viejo, corrido o cortado por la mitad.
  const screen = { w: Math.max(1, width), h: Math.max(1, height - (explore ? bar : 0)) };
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
  // De fondo: centrado y del 85 % del lado más corto.
  const side = Math.round(Math.min(screen.w, screen.h) * 0.85);
  const frame = explore
    ? { ...(wide ? { w: screen.h, h: screen.h } : { w: freeW, h: freeH }), dx: cx - screen.w / 2, dy: cy - screen.h / 2 }
    : place
      ? // El lugar queda en la parte de arriba: abajo va el contenido de la pantalla.
        { w: screen.w, h: screen.h, dx: 0, dy: -Math.round(screen.h * place.raise) }
      : { w: side, h: side, dx: 0, dy: 0 };
  const placement = explore ? (wide ? { top: bar, bottom: 0 } : { top: 0, bottom: bar }) : { top: 0, bottom: 0 };

  return (
    <View
      style={[styles.root, placement, explore ? styles.front : styles.back]}
      pointerEvents={explore ? 'box-none' : 'none'}
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
          frame={frame}
          view={explore ? { mode: 'explore' } : place ? { mode: 'place', lat: place.lat, lng: place.lng, altitude: place.altitude } : { mode: 'background' }}
          field={field}
          onTap={planet.onTap}
          onCountry={planet.onCountry}
          style={{ position: 'absolute', left: 0, top: 0, width: screen.w, height: screen.h }}
          accessibilityLabel={t('planet.label')}
        />
      ) : null}

      {explore ? null : <View style={[StyleSheet.absoluteFill, { backgroundColor: place ? PLACE_DIM : BACKGROUND_DIM }]} />}

      {!explore ? null : wide ? (
        <WideOverlay
          planet={planet}
          onSidebar={measure('left')}
          onCards={measure('right')}
          exploring={exploring}
          feed={feed}
          onLocate={locate}
          canLocate={canLocate}
          onExplore={() => {
            setExploring(true);
            setFocus({ ...planet.home, altitude: EXPLORE_ALTITUDE });
          }}
        />
      ) : (
        <CompactOverlay planet={planet} feed={feed} onTop={measure('top')} onBottom={measure('bottom')} height={screen.h} />
      )}
    </View>
  );
}

/** ?wind=1 (desde la pestaña Clima) abre el planeta con la capa de viento prendida. */
function useExplorePlanet() {
  const { wind } = useGlobalSearchParams<{ wind?: string }>();
  const planet = usePlanet({ initialWind: wind === '1' });
  // El planeta queda montado siempre: si se vuelve desde Clima con ?wind=1, se prende el viento igual.
  const { show } = planet.wind;
  useEffect(() => {
    if (wind === '1') show();
  }, [wind, show]);
  return planet;
}

/** Hueco libre por donde pasan los gestos al planeta, con el botón y los controles del viento. */
function FreeArea({ planet, children }: { planet: Planet; children?: ReactNode }) {
  return (
    <View style={styles.free} pointerEvents="box-none">
      {/* Mapa de viento, arriba a la derecha del planeta (donde el boceto pone "Barcos con GPS"). */}
      <View style={styles.freeTopRight} pointerEvents="box-none">
        <WindButton planet={planet} />
      </View>
      {children}
      <View style={styles.freeBottom} pointerEvents="box-none">
        <WindControls planet={planet} />
      </View>
    </View>
  );
}

/**
 * Celular (y web angosta), como el boceto de Miguel: arriba la marca (con MSailing y la campanita), la noticia del
 * momento y el clima de hoy; en el medio el planeta; abajo las capas o la zona elegida.
 */
function CompactOverlay({
  planet,
  feed,
  onTop,
  onBottom,
  height,
}: {
  planet: Planet;
  feed: FeedItem[] | null;
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
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="MSailing"
            hitSlop={8}
            onPress={() => router.push('/msailing')}
            style={styles.headerSide}
          >
            <Ionicons name="compass-outline" size={24} color={colors.text} />
          </Pressable>
          <Brand size={18} />
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            <NotificationBell />
          </View>
        </View>
        {feed?.length ? <NewsCard items={feed} /> : null}
        <WeatherCard fallback={planet.home} />
      </View>

      <FreeArea planet={planet} />

      <View style={styles.compactBottom} onLayout={onBottom}>
        {planet.zone ? (
          <ZonePanel planet={planet} maxHeight={Math.max(140, Math.round(height * 0.3))} />
        ) : (
          <>
            <LayerChips planet={planet} />
            <Text style={[styles.hint, styles.shadow]}>{t('planet.hint')}</Text>
          </>
        )}
      </View>
    </View>
  );
}

/** Aparece de a poco (al volver al inicio, para que el botón y las tarjetas no salten de golpe). */
function FadeIn({ children, delay = 0, gap }: { children: ReactNode; delay?: number; gap?: number }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 700, delay, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [opacity, delay]);
  return <Animated.View style={{ opacity, gap }}>{children}</Animated.View>;
}

/** Web ancha: título y capas a la izquierda, el planeta en el medio (detrás) y tarjetas a la derecha. */
function WideOverlay({
  planet,
  onSidebar,
  onCards,
  exploring,
  feed,
  onLocate,
  canLocate,
  onExplore,
}: {
  planet: Planet;
  onSidebar: (e: LayoutChangeEvent) => void;
  onCards: (e: LayoutChangeEvent) => void;
  exploring: boolean;
  feed: FeedItem[] | null;
  onLocate: (eventSlug: string) => void;
  canLocate: (eventSlug: string) => boolean;
  onExplore: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const titleSize = width >= 1400 ? 50 : width >= 1200 ? 44 : 38;
  // Noticias que entran en la columna de la derecha según el alto de la pantalla (cada tarjeta mide ~210 px;
  // arriba van el clima y el título de la sección).
  const feedCount = Math.max(1, Math.min(4, Math.floor((height - 68 - 150) / 210)));
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
        </View>
        <WindControls planet={planet} />
        {planet.zone ? (
          <ZonePanel planet={planet} maxHeight={Math.max(200, height - 560)} />
        ) : (
          <Text style={[styles.hint, styles.shadow, { textAlign: 'left' }]}>{t('planet.hint')}</Text>
        )}
      </View>
      {/* Hueco del planeta: deja pasar los gestos. */}
      <View style={styles.free} pointerEvents="box-none">
        {/* Sin noticias (o explorando), el clima queda arriba a la derecha; si no, va encima de las noticias. */}
        {exploring || !feed?.length ? (
          <View style={styles.freeTopRight} pointerEvents="box-none">
            <WeatherChip fallback={planet.home} windOn={planet.wind.on} onToggleWind={planet.wind.toggle} />
          </View>
        ) : null}
      </View>
      {exploring || !feed?.length ? null : (
        <View style={styles.cards} onLayout={onCards}>
          <View style={styles.cardsWeather}>
            <WeatherChip fallback={planet.home} windOn={planet.wind.on} onToggleWind={planet.wind.toggle} />
          </View>
          <FadeIn delay={500}>
            <TodayFeed items={feed.slice(0, feedCount)} onLocate={onLocate} canLocate={canLocate} layout="column" />
          </FadeIn>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.background, overflow: 'hidden' },
  // Explorar: encima de las pantallas. Otras secciones: detrás (las pantallas son transparentes).
  front: { zIndex: 2 },
  back: { zIndex: 0 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shadow: { textShadowColor: 'rgba(5,11,24,0.95)', textShadowRadius: 8 },
  headerSide: { width: 56, justifyContent: 'center' },
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
  freeTopLeft: { position: 'absolute', top: spacing.sm, left: spacing.lg },
  freeTopRight: { position: 'absolute', top: spacing.sm, right: spacing.lg },
  freeBottom: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.sm,
    alignItems: 'flex-start',
  },
  hint: { ...typography.caption, fontSize: 11, textAlign: 'center' },
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
    gap: spacing.lg,
    justifyContent: 'center',
  },
  cardsWeather: { alignSelf: 'flex-end' },
});
