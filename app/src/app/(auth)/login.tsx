import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/AuthContext';
import { errorMessage, isEmail } from '@/auth/errors';
import { AuthForm, FormLink } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailError = submitted && !isEmail(email) ? t('auth.invalidEmail') : undefined;
  const passwordError = submitted && !password ? t('auth.required') : undefined;

  async function submit() {
    setSubmitted(true);
    if (!isEmail(email) || !password) return;
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      // Solo rutas internas de la app, nunca una dirección externa.
      if (next?.startsWith('/') && !next.startsWith('//')) router.replace(next as Href);
      else router.dismissTo('/profile');
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')} error={error}>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={emailError}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <FormLink action={t('auth.forgot')} onPress={() => router.push({ pathname: '/forgot-password', params: { email } })} />
      <Button title={t('auth.loginButton')} onPress={submit} loading={loading} />
      <FormLink prompt={t('auth.noAccount')} action={t('auth.createAccount')} onPress={() => router.replace('/register')} />
    </AuthForm>
  );
}
