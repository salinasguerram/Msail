import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  title: string;
  subtitle: string;
  error?: string | null;
  children: ReactNode;
};

/** Estructura común de las pantallas de login, registro y recuperación. */
export function AuthForm({ title, subtitle, error, children }: Props) {
  const { t } = useTranslation();
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        hitSlop={12}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.close}
      >
        <Ionicons name="close" size={26} color={colors.text} />
      </Pressable>
      <View style={styles.header}>
        <Text style={typography.title}>{title}</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      {error ? (
        <View style={styles.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
    </Screen>
  );
}

export function FormLink({ prompt, action, onPress }: { prompt?: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.linkRow}>
      {prompt ? <Text style={typography.caption}>{prompt}</Text> : null}
      <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
        <Text style={styles.link}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  close: { alignSelf: 'flex-end', padding: spacing.xs },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  body: { gap: spacing.lg },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  errorText: { color: colors.text, flex: 1 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
