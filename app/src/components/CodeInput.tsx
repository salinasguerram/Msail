import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { TextField } from '@/components/TextField';

type Props = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onComplete?: () => void;
};

/** Campo para el código de 6 dígitos que llega por email. */
export function CodeInput({ value, onChange, error, onComplete }: Props) {
  const { t } = useTranslation();
  return (
    <TextField
      label={t('auth.code')}
      value={value}
      onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 6))}
      error={error}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={6}
      placeholder="000000"
      onSubmitEditing={onComplete}
      style={styles.code}
    />
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 28, letterSpacing: 12, textAlign: 'center', fontWeight: '700' },
});
