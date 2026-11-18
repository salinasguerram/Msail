import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  week: number;
};

/** Pantalla provisoria para secciones que se construyen en semanas siguientes del roadmap. */
export function ComingSoon({ icon, title, description, week }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.iconRing}>
        <Ionicons name={icon} size={40} color={colors.primary} />
      </View>
      <Text style={[typography.title, styles.center]}>{title}</Text>
      <Text style={[typography.body, styles.center, styles.muted]}>{description}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{t('common.comingWeek', { week })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  center: { textAlign: 'center', maxWidth: 420 },
  muted: { color: colors.textMuted },
  badge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  badgeText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
});
