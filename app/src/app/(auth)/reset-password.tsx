import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { errorMessage, fieldError } from '@/auth/errors';
import { AuthForm, FormLink } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { CodeInput } from '@/components/CodeInput';
import { TextField } from '@/components/TextField';
import { typography } from '@/theme';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { confirmPasswordReset } = useAuth();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  if (!email) return <Redirect href="/forgot-password" />;

  async function submit() {
    setSubmitted(true);
    setApiError(null);
    if (code.length !== 6 || !password) return;
    setLoading(true);
    try {
      await confirmPasswordReset(email!, code, password);
      router.dismissTo('/profile');
    } catch (e) {
      setApiError(e);
    } finally {
      setLoading(false);
    }
  }

  const codeError = (submitted && code.length !== 6 ? t('auth.invalidCode') : undefined) ?? fieldError(apiError, 'code');
  const passwordError = (submitted && !password ? t('auth.required') : undefined) ?? fieldError(apiError, 'new_password');

  return (
    <AuthForm
      title={t('auth.resetTitle')}
      subtitle={t('auth.resetText', { email })}
      error={apiError && !fieldError(apiError, 'code') && !fieldError(apiError, 'new_password') ? errorMessage(apiError, t) : null}
    >
      <CodeInput value={code} onChange={setCode} error={codeError} />
      <TextField
        label={t('auth.newPassword')}
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={submit}
      />
      {!passwordError && <Text style={typography.caption}>{t('auth.passwordHint')}</Text>}
      <Button title={t('auth.resetButton')} onPress={submit} loading={loading} />
      <FormLink action={t('auth.resend')} onPress={() => router.replace({ pathname: '/forgot-password', params: { email } })} />
    </AuthForm>
  );
}
