import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme';

/**
 * "Servicios y amarres": una sola sección con dos partes. Arriba de Marinas y de Profesionales va este selector,
 * así se pasa de dónde amarrar o pasar la noche a bordo a los profesionales y servicios, y viceversa.
 */
export function ServicesSwitch({ current }: { current: 'marinas' | 'professionals' }) {
  const { t } = useTranslation();
  const items = [
    { key: 'marinas' as const, icon: 'boat-outline' as const, label: t('services.berths'), href: '/marinas' as const },
    { key: 'professionals' as const, icon: 'construct-outline' as const, label: t('services.professionals'), href: '/professionals' as const },
  ];
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.title}>{t('services.title')}</Text>
      <View style={styles.switch} accessibilityRole="tablist">
        {items.map((item) => {
          const active = item.key === current;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => (active ? undefined : router.navigate(item.href))}
              style={[styles.option, active && styles.active]}
            >
              <Ionicons name={item.icon} size={16} color={active ? '#fff' : colors.textMuted} />
              <Text style={[styles.text, active && { color: '#fff' }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 20 },
  switch: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  active: { backgroundColor: colors.primary },
  text: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 14 },
});
