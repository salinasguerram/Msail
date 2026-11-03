import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/AuthContext';
import { errorMessage, isEmail } from '@/auth/errors';
import { AuthForm, FormLink } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { requestPasswordReset } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitted(true);
    if (!isEmail(email)) return;
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      router.replace({ pathname: '/reset-password', params: { email: email.trim() } });
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm title={t('auth.forgotTitle')} subtitle={t('auth.forgotText')} error={error}>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={submitted && !isEmail(email) ? t('auth.invalidEmail') : undefined}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        onSubmitEditing={submit}
      />
      <Button title={t('auth.sendCode')} onPress={submit} loading={loading} />
      <FormLink prompt={t('auth.haveAccount')} action={t('auth.loginButton')} onPress={() => router.replace('/login')} />
    </AuthForm>
  );
}
