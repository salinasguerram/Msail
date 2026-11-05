import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { Brand } from '@/components/Brand';
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
const GLOBE_MIN = 180;
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

/** Lugar reservado para el planeta 3D (semana 7). Se ajusta al lado más corto del espacio disponible. */
function GlobePlaceholder({ maxSize, estimate }: { maxSize: number; estimate: number }) {
  const { t } = useTranslation();
  // Arranca con una estimación según la ventana y se corrige al medir el espacio real.
  const [size, setSize] = useState(() => Math.max(GLOBE_MIN, Math.min(estimate, maxSize)));

  function fit(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize(Math.max(GLOBE_MIN, Math.round(Math.min(width, height - 40, maxSize))));
  }

  return (
    <View style={styles.globeArea} onLayout={fit} accessibilityLabel={t('explore.globeSoon')}>
      <View style={[styles.globe, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons name="earth" size={Math.round(size * 0.32)} color={colors.primary} />
      </View>
      <View style={styles.globeBadge}>
        <Text style={styles.globeBadgeText}>
          {t('explore.globeSoon')} · {t('common.comingWeek', { week: 7 })}
        </Text>
      </View>
    </View>
  );
}

/** Celular (y web angosta): título arriba, planeta al medio y accesos pegados abajo. */
function CompactExplore() {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  return (
    <Screen edges={['top', 'left', 'right']} contentStyle={styles.page}>
      <View style={{ marginTop: spacing.sm }}>
        <Brand />
      </View>
      <Hero />
      <GlobePlaceholder maxSize={360} estimate={Math.min(width - 64, height - 520)} />
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
  const { width, height } = useWindowDimensions();
  return (
    <Screen edges={['top', 'left', 'right']} contentStyle={styles.widePage}>
      <View style={styles.sidebar}>
        <Brand size={20} />
        <Hero titleSize={36} />
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
      <GlobePlaceholder maxSize={680} estimate={Math.min(width - SIDEBAR_WIDTH - 160, height - 200)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  globeArea: {
    flex: 1,
    minHeight: GLOBE_MIN + 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globe: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 12,
  },
  globeBadge: {
    marginTop: -spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  globeBadgeText: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
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
  sidebar: { width: SIDEBAR_WIDTH, gap: spacing.xl, paddingTop: spacing.sm, justifyContent: 'center' },
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
