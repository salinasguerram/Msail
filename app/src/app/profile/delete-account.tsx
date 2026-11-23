import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { errorMessage, fieldError } from '@/auth/errors';
import { Card } from '@/components/Card';
import { useDialogs } from '@/components/Dialogs';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, fonts, radius, spacing, typography } from '@/theme';

const WHAT = ['account', 'profile', 'boats', 'activity', 'premium'] as const;

/**
 * Eliminar la cuenta (lo exigen App Store y Google Play). Se confirma con la contraseña o, si entró con Google o
 * Apple, escribiendo el email. Se borra todo y no se puede deshacer.
 */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { user, deleteAccount } = useAuth();
  const { confirm, notify } = useDialogs();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!user) return <Redirect href="/profile" />;
  const withPassword = user.has_password !== false;
  const field = withPassword ? 'password' : 'email';

  const submit = async () => {
    setError(null);
    if (!value.trim()) return;
    const ok = await confirm({
      title: t('deleteAccount.confirmTitle'),
      message: t('deleteAccount.confirmText'),
      confirmLabel: t('deleteAccount.button'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteAccount(withPassword ? { password: value } : { email: value.trim() });
      notify(t('deleteAccount.done'));
      router.replace('/');
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const generalError = error && !fieldError(error, field) ? errorMessage(error, t) : null;

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.warning}>
          <Ionicons name="warning-outline" size={24} color={colors.danger} />
          <Text style={[typography.body, { flex: 1 }]}>{t('deleteAccount.intro')}</Text>
        </View>

        <Card style={{ gap: spacing.sm }}>
          <Text style={typography.label}>{t('deleteAccount.whatTitle')}</Text>
          {WHAT.map((key) => (
            <View key={key} style={styles.item}>
              <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
              <Text style={[typography.body, { flex: 1 }]}>{t(`deleteAccount.what.${key}`)}</Text>
            </View>
          ))}
        </Card>

        <TextField
          label={withPassword ? t('deleteAccount.passwordLabel') : t('deleteAccount.emailLabel', { email: user.email })}
          value={value}
          onChangeText={setValue}
          secureTextEntry={withPassword}
          autoCapitalize="none"
          autoComplete={withPassword ? 'current-password' : 'off'}
          error={fieldError(error, field)}
          onSubmitEditing={submit}
        />
        {generalError ? <Text style={[typography.body, { color: colors.danger }]}>{generalError}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy || !value.trim()}
          onPress={submit}
          style={({ pressed }) => [styles.danger, (busy || !value.trim()) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.dangerText}>{busy ? t('deleteAccount.deleting') : t('deleteAccount.button')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'rgba(255,90,95,0.08)',
  },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  danger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
  },
  dangerText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 16 },
});
