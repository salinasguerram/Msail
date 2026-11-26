import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

/** Aviso amarillo de «datos de ejemplo» (regatas inventadas para mostrar el ranking, tracks simulados...). */
export function DemoNotice({ text }: { text: string }) {
  return (
    <View style={styles.box}>
      <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
      <Text style={[typography.caption, { flex: 1, color: colors.warning }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: 'rgba(245,185,66,0.08)',
  },
});
