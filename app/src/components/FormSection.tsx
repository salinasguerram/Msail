import type { ReactNode } from 'react';
import { Alert, Platform, StyleSheet, Switch, Text, View } from 'react-native';

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

/** Confirmación antes de una acción destructiva. En la web `Alert` no muestra botones, así que se usa `confirm`. */
export function confirmAction(message: string, confirmLabel: string, cancelLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(message) ?? false);
  return new Promise((resolve) =>
    Alert.alert(message, undefined, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  error: { color: colors.danger, fontSize: 13 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});

type Choice = { key: string; label: string; destructive?: boolean };

/** Menú de opciones. En la web no hay hojas de acción nativas: se usa `prompt` numerado. */
export function chooseAction(title: string, choices: Choice[], cancelLabel: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    const text = [title, ...choices.map((c, i) => `${i + 1}. ${c.label}`)].join('\n');
    const answer = globalThis.prompt?.(text, '1');
    const index = Number(answer) - 1;
    return Promise.resolve(choices[index]?.key ?? null);
  }
  return new Promise((resolve) =>
    Alert.alert(title, undefined, [
      ...choices.map((c) => ({
        text: c.label,
        style: c.destructive ? ('destructive' as const) : ('default' as const),
        onPress: () => resolve(c.key),
      })),
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(null) },
    ]),
  );
}
