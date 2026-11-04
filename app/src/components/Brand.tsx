import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

/**
 * Marca provisoria de MSAIL LEAGUE (ícono + nombre) hasta tener el logo oficial.
 * Se usa en la home y en los encabezados de las secciones.
 */
export function Brand({ size = 18 }: { size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="MSAIL LEAGUE">
      <Ionicons name="navigate" size={size + 4} color={colors.primary} />
      <Text style={[styles.text, { fontSize: size }]}>
        MSAIL <Text style={{ color: colors.primary }}>LEAGUE</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { color: colors.text, fontWeight: '800', letterSpacing: 2 },
});
