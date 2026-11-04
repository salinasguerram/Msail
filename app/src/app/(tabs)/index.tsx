import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

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

const GLOBE_MIN = 180;
const GLOBE_MAX = 360;

export default function ExploreScreen() {
  const { t } = useTranslation();
  const [globeSize, setGlobeSize] = useState(260);

  // El globo ocupa el espacio libre entre el título y los botones: se ajusta al lado más corto,
  // así nunca tapa el título (en la web, con pantallas anchas) ni empuja los botones.
  function fitGlobe(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    const size = Math.round(Math.min(width, height - 40, GLOBE_MAX));
    setGlobeSize(Math.max(GLOBE_MIN, size));
  }

  return (
    <Screen edges={['top', 'left', 'right']} contentStyle={styles.page}>
      <View style={{ marginTop: spacing.sm }}>
        <Brand />
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>
          {t('explore.heroTitle')}
          {'\n'}
          <Text style={{ color: colors.primary }}>{t('explore.heroAccent')}</Text>
        </Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('explore.heroSubtitle')}</Text>
      </View>

      {/* Lugar reservado para el planeta 3D (semana 7). */}
      <View style={styles.globeArea} onLayout={fitGlobe} accessibilityLabel={t('explore.globeSoon')}>
        <View style={[styles.globe, { width: globeSize, height: globeSize, borderRadius: globeSize / 2 }]}>
          <Ionicons name="earth" size={Math.round(globeSize * 0.32)} color={colors.primary} />
        </View>
        <View style={styles.globeBadge}>
          <Text style={styles.globeBadgeText}>
            {t('explore.globeSoon')} · {t('common.comingWeek', { week: 7 })}
          </Text>
        </View>
      </View>

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

const styles = StyleSheet.create({
  // Ocupa todo el alto disponible: el globo se estira y los botones quedan pegados abajo.
  page: { flexGrow: 1 },
  hero: { gap: spacing.sm },
  heroTitle: { ...typography.title, fontSize: 32, lineHeight: 38, textTransform: 'uppercase' },
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
});
