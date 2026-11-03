import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage, fieldError } from '@/auth/errors';
import { AuthForm, FormLink } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { CodeInput } from '@/components/CodeInput';
import { colors, typography } from '@/theme';

const RESEND_SECONDS = 60;

export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { user, verifyEmail, resendVerification } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!user) return <Redirect href="/login" />;

  const done = () => router.dismissTo('/profile');

  async function submit() {
    if (code.length !== 6) {
      setApiError(new ApiError(400, { code: [t('auth.invalidCode')] }));
      return;
    }
    setLoading(true);
    setApiError(null);
    try {
      await verifyEmail(code);
      done();
    } catch (e) {
      setApiError(e);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setApiError(null);
    setNotice(null);
    try {
      await resendVerification();
      setNotice(t('auth.resendSent'));
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        const wait = Number((e.data as { retry_after?: number })?.retry_after);
        if (wait > 0) setCooldown(wait);
      }
      setApiError(e);
    }
  }

  const codeError = fieldError(apiError, 'code');

  return (
    <AuthForm
      title={t('auth.verifyTitle')}
      subtitle={t('auth.verifyText', { email: user.email })}
      error={apiError && !codeError ? errorMessage(apiError, t) : null}
    >
      <CodeInput value={code} onChange={setCode} error={codeError} onComplete={submit} />
      {notice ? <Text style={[typography.caption, { color: colors.success, textAlign: 'center' }]}>{notice}</Text> : null}
      <Button title={t('auth.verifyButton')} onPress={submit} loading={loading} />
      {cooldown > 0 ? (
        <Text style={[typography.caption, { textAlign: 'center' }]}>{t('auth.resendIn', { seconds: cooldown })}</Text>
      ) : (
        <FormLink action={t('auth.resend')} onPress={resend} />
      )}
      <Button title={t('auth.later')} variant="ghost" onPress={done} />
    </AuthForm>
  );
}
