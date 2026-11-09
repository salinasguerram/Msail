import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { MarinaService } from '@/api/marinas';
import { colors, radius, spacing } from '@/theme';

export const SERVICE_ICONS: Record<MarinaService, ComponentProps<typeof Ionicons>['name']> = {
  water: 'water-outline',
  electricity: 'flash-outline',
  showers: 'rainy-outline',
  fuel: 'speedometer-outline',
  wifi: 'wifi-outline',
  laundry: 'shirt-outline',
  security: 'shield-checkmark-outline',
  boatyard: 'construct-outline',
};

/** Íconos con nombre de los servicios informados. */
export function MarinaServices({ services, compact = false }: { services: MarinaService[]; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.list}>
      {services.map((service) => (
        <View key={service} style={[styles.item, compact && styles.compact]}>
          <Ionicons name={SERVICE_ICONS[service]} size={compact ? 13 : 16} color={colors.primary} />
          <Text style={[styles.text, compact && { fontSize: 12 }]}>{t(`marinas.services.${service}`)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  compact: { paddingHorizontal: spacing.sm, paddingVertical: 3, gap: 4 },
  text: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
