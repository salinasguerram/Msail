import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

type Shortcut = {
  key: 'races' | 'marinas' | 'professionals' | 'weather' | 'learning' | 'news';
  icon: ComponentProps<typeof Ionicons>['name'];
  href: Href;
};

const SHORTCUTS: Shortcut[] = [
  { key: 'races', icon: 'trophy-outline', href: '/races' },
  { key: 'marinas', icon: 'boat-outline', href: '/marinas' },
  { key: 'professionals', icon: 'construct-outline', href: '/professionals' },
  { key: 'weather', icon: 'partly-sunny-outline', href: '/weather' },
  { key: 'learning', icon: 'school-outline', href: '/learning' },
  { key: 'news', icon: 'newspaper-outline', href: '/news' },
];

export default function ExploreScreen() {
  const { t } = useTranslation();

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.brand}>
        <Ionicons name="navigate" size={22} color={colors.primary} />
        <Text style={styles.brandText}>
          MSAIL <Text style={{ color: colors.primary }}>LEAGUE</Text>
        </Text>
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
      <View style={styles.globe} accessibilityLabel={t('explore.globeSoon')}>
        <View style={styles.globeInner}>
          <Ionicons name="earth" size={96} color={colors.primary} />
        </View>
        <View style={styles.globeBadge}>
          <Text style={styles.globeBadgeText}>
            {t('explore.globeSoon')} · {t('common.comingWeek', { week: 7 })}
          </Text>
        </View>
      </View>

      <Text style={typography.label}>{t('explore.quickAccess')}</Text>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  brandText: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: 2 },
  hero: { gap: spacing.sm },
  heroTitle: { ...typography.title, fontSize: 32, lineHeight: 38, textTransform: 'uppercase' },
  globe: {
    aspectRatio: 1,
    maxHeight: 340,
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  globeInner: {
    width: '78%',
    aspectRatio: 1,
    borderRadius: 999,
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
    position: 'absolute',
    bottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  globeBadgeText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
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
