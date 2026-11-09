import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { getMyBoats, type BoatSummary } from '@/api/boats';
import { createQuote, getProfessional, type ProfessionalDetail } from '@/api/professionals';
import { errorMessage, fieldError } from '@/auth/errors';
import { withAuth } from '@/auth/withAuth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { useDialogs } from '@/components/Dialogs';
import { FormSection } from '@/components/FormSection';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, spacing, typography } from '@/theme';

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export default withAuth(QuoteScreen);

/** Pedido de presupuesto a un profesional: qué se necesita, el barco, dónde y para cuándo. */
function QuoteScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { notify } = useDialogs();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(null);
  const [boats, setBoats] = useState<BoatSummary[]>([]);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [boat, setBoat] = useState<number | null>(null);
  const [boatDescription, setBoatDescription] = useState('');
  const [details, setDetails] = useState('');
  const [location, setLocation] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  useEffect(() => {
    getProfessional(slug)
      .then((p) => {
        setProfessional(p);
        // Si hace una sola cosa, ya queda elegida.
        if (p.specialties.length === 1) setSpecialty(p.specialties[0].slug);
      })
      .catch(setApiError);
    getMyBoats().then(setBoats).catch(() => {});
  }, [slug]);

  useLayoutEffect(() => {
    if (professional) navigation.setOptions({ title: t('quotes.titleFor', { name: professional.name }) });
  }, [navigation, professional, t]);

  const errors = {
    details: submitted && details.trim().length < 10 ? t('quotes.detailsShort') : fieldError(apiError, 'details'),
    neededBy: submitted && neededBy && !isDate(neededBy) ? t('result.invalidDate') : fieldError(apiError, 'needed_by'),
  };

  async function submit() {
    setSubmitted(true);
    setApiError(null);
    if (details.trim().length < 10 || (neededBy && !isDate(neededBy))) return;
    setSaving(true);
    try {
      await createQuote(slug, {
        specialty,
        boat,
        boat_description: boat ? '' : boatDescription.trim(),
        details: details.trim(),
        location: location.trim(),
        needed_by: neededBy || null,
        contact_phone: phone.trim(),
      });
      notify(t('quotes.sent'));
      router.replace('/professionals/quotes');
    } catch (e) {
      setApiError(e);
    } finally {
      setSaving(false);
    }
  }

  if (!professional) {
    return (
      <Screen>
        {apiError ? (
          <Text style={{ color: colors.danger }}>{errorMessage(apiError, t)}</Text>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        )}
      </Screen>
    );
  }

  const hasFieldError = Object.values(errors).some(Boolean);
  return (
    <Screen>
      <Card>
        <Text style={[typography.body, { fontWeight: '700' }]}>{professional.name}</Text>
        <Text style={typography.caption}>{t('quotes.howItWorks')}</Text>
      </Card>

      {professional.specialties.length > 1 ? (
        <FormSection label={t('quotes.service')}>
          <ChipGroup>
            {professional.specialties.map((s) => (
              <Chip key={s.slug} label={s.name} selected={specialty === s.slug} onPress={() => setSpecialty(specialty === s.slug ? null : s.slug)} />
            ))}
          </ChipGroup>
        </FormSection>
      ) : null}

      <TextField
        label={t('quotes.details')}
        value={details}
        onChangeText={setDetails}
        multiline
        placeholder={t('quotes.detailsPlaceholder')}
        error={errors.details}
      />

      {boats.length ? (
        <FormSection label={t('quotes.boat')}>
          <ChipGroup>
            {boats.map((b) => (
              <Chip key={b.id} label={b.name} selected={boat === b.id} onPress={() => setBoat(boat === b.id ? null : b.id)} />
            ))}
          </ChipGroup>
        </FormSection>
      ) : null}
      {!boat ? (
        <TextField
          label={t('quotes.boatDescription')}
          value={boatDescription}
          onChangeText={setBoatDescription}
          placeholder={t('quotes.boatPlaceholder')}
        />
      ) : null}

      <TextField label={t('quotes.location')} value={location} onChangeText={setLocation} placeholder={t('quotes.locationPlaceholder')} />
      <TextField
        label={t('quotes.neededBy')}
        value={neededBy}
        onChangeText={(v) => setNeededBy(v.replace(/[^\d-]/g, '').slice(0, 10))}
        placeholder={t('result.datePlaceholder')}
        keyboardType="numbers-and-punctuation"
        error={errors.neededBy}
      />
      <TextField label={t('berth.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+54 9 11 1234 5678" />

      {apiError && !hasFieldError ? <Text style={{ color: colors.danger }}>{errorMessage(apiError, t)}</Text> : null}
      <Button title={t('quotes.submit')} onPress={submit} loading={saving} />
      <Text style={styles.note}>{t('quotes.privacy')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.caption, textAlign: 'center' },
});
