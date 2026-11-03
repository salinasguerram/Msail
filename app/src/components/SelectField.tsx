import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';

export type SelectOption = { value: string; label: string; hint?: string };

type Props = {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  disabledHint?: string;
  error?: string;
  /** Si se pasa, la búsqueda la hace el servidor (ej. clubes) en lugar de filtrar la lista. */
  onSearch?: (query: string) => void;
  emptyText?: string;
};

/** Campo que abre una lista con buscador para elegir una opción (país, región, club). */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  disabledHint,
  error,
  onSearch,
  emptyText,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);

  const visible = useMemo(() => {
    if (onSearch) return options;
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query, onSearch]);

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={styles.wrapper}>
      <Text style={typography.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.field, !!error && { borderColor: colors.danger }, disabled && { opacity: 0.5 }]}
      >
        <Text style={[styles.value, !selected && { color: colors.textMuted }]} numberOfLines={1}>
          {selected?.label ?? placeholder ?? t('select.choose')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {disabled && disabledHint ? <Text style={typography.caption}>{disabledHint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.backdrop}>
          <View style={styles.panel}>
            <Text style={typography.heading}>{label}</Text>
            <TextInput
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                onSearch?.(text);
              }}
              placeholder={t('select.search')}
              placeholderTextColor={colors.textMuted}
              style={styles.search}
              autoCorrect={false}
              accessibilityLabel={t('select.search')}
            />
            <FlatList
              data={visible}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0 }}
              ListEmptyComponent={<Text style={[typography.caption, styles.empty]}>{emptyText ?? t('select.empty')}</Text>}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.value === value }}
                  onPress={() => pick(item.value)}
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceRaised }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{item.label}</Text>
                    {item.hint ? <Text style={typography.caption}>{item.hint}</Text> : null}
                  </View>
                  {item.value === value ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              )}
            />
            {value ? <Button title={t('select.clear')} variant="ghost" onPress={() => pick(null)} /> : null}
            <Button title={t('common.cancel')} variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs + 2 },
  field: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  value: { flex: 1, color: colors.text, fontSize: 16 },
  error: { color: colors.danger, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(3,7,18,0.72)', justifyContent: 'center', padding: spacing.lg },
  panel: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  search: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  empty: { textAlign: 'center', paddingVertical: spacing.lg },
});
