import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Brand } from '@/components/Brand';
import { Globe } from '@/components/globe/Globe';
import { LayerChips, usePlanet, WindButton, WindControls, ZonePanel, type Planet } from '@/components/globe/PlanetExplorer';
import { NotificationBell } from '@/components/NotificationBell';
import { Screen } from '@/components/Screen';
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

/** Desde este ancho, en la web, la home pasa a dos columnas: menú a la izquierda y el planeta grande. */
const WIDE_WEB_MIN = 900;
const GLOBE_MIN = 300;
const SIDEBAR_WIDTH = 360;

export default function ExploreScreen() {
  const { width } = useWindowDimensions();
  // Solo en la web y en pantallas anchas. En iOS/Android (y en la web angosta) queda el diseño de siempre.
  const wide = Platform.OS === 'web' && width >= WIDE_WEB_MIN;
  return wide ? <WideExplore /> : <CompactExplore />;
}

function Hero({ titleSize = 32 }: { titleSize?: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.hero}>
      <Text style={[styles.heroTitle, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.18) }]}>
        {t('explore.heroTitle')}
        {'\n'}
        <Text style={{ color: colors.primary }}>{t('explore.heroAccent')}</Text>
      </Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>{t('explore.heroSubtitle')}</Text>
    </View>
  );
}

/** Planeta 3D con regatas, marinas y profesionales. Tocar un pin o un lugar muestra lo que hay en esa zona. */
function PlanetView({ planet, style }: { planet: Planet; style?: object }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.globeArea, style]}>
      <Globe
        points={planet.points}
        layers={planet.layers}
        selected={planet.zone}
        wind={planet.wind.cells}
        onTap={planet.onTap}
        onCountry={planet.onCountry}
        style={StyleSheet.absoluteFill}
        accessibilityLabel={t('planet.label')}
      />
      <View style={styles.globeTop} pointerEvents="box-none">
        <WindButton planet={planet} />
      </View>
      <View style={styles.globeBottom} pointerEvents="box-none">
        <WindControls planet={planet} />
      </View>
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

/** Celular (y web angosta): título arriba, planeta al medio y accesos pegados abajo. */
function CompactExplore() {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const planet = useExplorePlanet();
  return (
    <Screen edges={['top', 'left', 'right']} contentStyle={styles.page}>
      <View style={[styles.brandRow, { marginTop: spacing.sm }]}>
        <Brand />
        <NotificationBell />
      </View>
      <Hero />
      <LayerChips planet={planet} />
      <PlanetView planet={planet} style={{ minHeight: Math.max(GLOBE_MIN, Math.round(height * 0.42)) }} />
      {planet.zone ? <ZonePanel planet={planet} /> : <Text style={styles.hint}>{t('planet.hint')}</Text>}
      <View style={styles.grid}>
        {SHORTCUTS.map(({ key, icon, href }) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            onPress={() => router.push(href)}
            style={({ pressed }) => [styles.tile, pressed && { borderColor: colors.primary }]}
          >
            <Ionicons name={icon} size={26} color={colors.primary} />
            <Text style={styles.tileText}>{t(`explore.${key}`)}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

/** Web ancha: columna con título y menú de secciones a la izquierda; el planeta ocupa el resto. */
function WideExplore() {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const planet = useExplorePlanet();
  return (
    <Screen edges={['top', 'left', 'right']} contentStyle={styles.widePage}>
      <View style={styles.sidebar}>
        <View style={styles.brandRow}>
          <Brand size={20} />
          <NotificationBell />
        </View>
        <Hero titleSize={36} />
        <LayerChips planet={planet} />
        {planet.zone ? <ZonePanel planet={planet} maxHeight={Math.max(240, height - 520)} /> : <Text style={styles.hint}>{t('planet.hint')}</Text>}
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
      <PlanetView planet={planet} style={{ minHeight: Math.max(GLOBE_MIN, height - 120) }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Ocupa todo el alto disponible: el globo se estira y los botones quedan pegados abajo.
  page: { flexGrow: 1 },
  widePage: {
    flexGrow: 1,
    flexDirection: 'row',
    maxWidth: 1400,
    gap: spacing.xxl,
    paddingHorizontal: spacing.xxl,
  },
  hero: { gap: spacing.sm },
  heroTitle: { ...typography.title, textTransform: 'uppercase' },
  globeArea: { flex: 1, minHeight: GLOBE_MIN, borderRadius: radius.lg, overflow: 'hidden' },
  globeTop: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  globeBottom: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: spacing.sm, alignItems: 'flex-start' },
  hint: { ...typography.caption, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  tileText: { color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  sidebar: { width: SIDEBAR_WIDTH, gap: spacing.lg, paddingTop: spacing.sm, justifyContent: 'center' },
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
