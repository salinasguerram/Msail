import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

/** Etiqueta. Con `onPress` funciona como opción seleccionable. */
export function Chip({ label, selected = false, onPress }: Props) {
  const content = <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>;
  if (!onPress) return <View style={[styles.chip, selected && styles.selected]}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { color: colors.text, fontSize: 13, fontWeight: '600' },
  selectedText: { color: '#fff' },
});
