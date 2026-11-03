import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { errorMessage, fieldError, isEmail } from '@/auth/errors';
import { AuthForm, FormLink } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { spacing, typography } from '@/theme';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const required = (value: string) => (submitted && !value.trim() ? t('auth.required') : undefined);

  const errors = {
    first_name: required(form.first_name) ?? fieldError(apiError, 'first_name'),
    last_name: required(form.last_name) ?? fieldError(apiError, 'last_name'),
    email: (submitted && !isEmail(form.email) ? t('auth.invalidEmail') : undefined) ?? fieldError(apiError, 'email'),
    password: required(form.password) ?? fieldError(apiError, 'password'),
  };
  const hasFieldError = ['first_name', 'last_name', 'email', 'password'].some((f) => fieldError(apiError, f));

  async function submit() {
    setSubmitted(true);
    setApiError(null);
    if (!form.first_name.trim() || !form.last_name.trim() || !isEmail(form.email) || !form.password) return;
    setLoading(true);
    try {
      await register({ ...form, email: form.email.trim() });
      router.replace('/verify-email');
    } catch (e) {
      setApiError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      error={apiError && !hasFieldError ? errorMessage(apiError, t) : null}
    >
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label={t('auth.firstName')}
            value={form.first_name}
            onChangeText={set('first_name')}
            error={errors.first_name}
            autoComplete="given-name"
            textContentType="givenName"
          />
        </View>
        <View style={styles.half}>
          <TextField
            label={t('auth.lastName')}
            value={form.last_name}
            onChangeText={set('last_name')}
            error={errors.last_name}
            autoComplete="family-name"
            textContentType="familyName"
          />
        </View>
      </View>
      <TextField
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <View style={{ gap: spacing.xs }}>
        <TextField
          label={t('auth.password')}
          value={form.password}
          onChangeText={set('password')}
          error={errors.password}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
        />
        {!errors.password && <Text style={typography.caption}>{t('auth.passwordHint')}</Text>}
      </View>
      <Button title={t('auth.registerButton')} onPress={submit} loading={loading} />
      <FormLink prompt={t('auth.haveAccount')} action={t('auth.loginButton')} onPress={() => router.replace('/login')} />
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});
