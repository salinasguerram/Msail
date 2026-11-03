import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

export function FormSection({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <View style={styles.section}>
      <Text style={typography.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={typography.body}>{label}</Text>
        {hint ? <Text style={typography.caption}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  error: { color: colors.danger, fontSize: 13 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
