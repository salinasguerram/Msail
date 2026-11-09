import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getMyBoats, type BoatSummary } from '@/api/boats';
import { createBerthRequest, getMarina, type BoatType, type MarinaDetail } from '@/api/marinas';
import { useAuth } from '@/auth/AuthContext';
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
import { estimate, formatMoney } from '@/utils/marinaRates';

const BOAT_TYPES: BoatType[] = ['sailboat', 'catamaran', 'motor'];
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const meters = (value: string) => value.replace(',', '.').replace(/[^\d.]/g, '').slice(0, 6);
const dateInput = (value: string) => value.replace(/[^\d-]/g, '').slice(0, 10);
const nightsBetween = (from: string, to: string) =>
  isDate(from) && isDate(to) ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) : 0;

export default withAuth(BerthRequestScreen);

/** Formulario para pedir amarre en una marina: datos del velero, fechas y contacto. */
function BerthRequestScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { notify } = useDialogs();
  const { slug, length: lengthParam } = useLocalSearchParams<{ slug: string; length?: string }>();

  const [marina, setMarina] = useState<MarinaDetail | null>(null);
  const [boats, setBoats] = useState<BoatSummary[]>([]);
  const [boat, setBoat] = useState<number | null>(null);
  const [boatName, setBoatName] = useState('');
  const [boatType, setBoatType] = useState<BoatType>('sailboat');
  const [length, setLength] = useState(lengthParam ?? '');
  const [beam, setBeam] = useState('');
  const [draft, setDraft] = useState('');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [name, setName] = useState(user ? `${user.first_name} ${user.last_name}`.trim() : '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  useEffect(() => {
    getMarina(slug).then(setMarina).catch(setApiError);
    getMyBoats().then(setBoats).catch(() => {});
  }, [slug]);

  useLayoutEffect(() => {
    if (marina) navigation.setOptions({ title: t('berth.titleFor', { marina: marina.name }) });
  }, [navigation, marina, t]);

  function pickBoat(next: BoatSummary) {
    if (boat === next.id) {
      setBoat(null);
      return;
    }
    // Al elegir un barco propio se completan el nombre y las medidas cargadas.
    setBoat(next.id);
    setBoatName(next.name);
    if (next.length_m) setLength(String(Number(next.length_m)));
    if (next.beam_m) setBeam(String(Number(next.beam_m)));
    if (next.draft_m) setDraft(String(Number(next.draft_m)));
  }

  const nights = nightsBetween(arrival, departure);
  const errors = {
    boatName: submitted && !boatName.trim() ? t('auth.required') : fieldError(apiError, 'boat_name'),
    length: submitted && !(Number(length) > 0) ? t('auth.required') : fieldError(apiError, 'length_m'),
    draft: fieldError(apiError, 'draft_m'),
    arrival: submitted && !isDate(arrival) ? t('result.invalidDate') : fieldError(apiError, 'arrival'),
    departure:
      submitted && !isDate(departure)
        ? t('result.invalidDate')
        : submitted && nights <= 0
          ? t('berth.departureAfter')
          : fieldError(apiError, 'departure'),
    email: fieldError(apiError, 'contact_email'),
  };

  async function submit() {
    setSubmitted(true);
    setApiError(null);
    if (!boatName.trim() || !(Number(length) > 0) || !isDate(arrival) || !isDate(departure) || nights <= 0) return;
    setSaving(true);
    try {
      await createBerthRequest(slug, {
        boat,
        boat_name: boatName.trim(),
        boat_type: boatType,
        length_m: length,
        beam_m: beam || null,
        draft_m: draft || null,
        arrival,
        departure,
        contact_name: name.trim(),
        contact_email: email.trim(),
        contact_phone: phone.trim(),
        message: message.trim(),
      });
      notify(t('berth.sent'));
      router.replace('/marinas/requests');
    } catch (e) {
      setApiError(e);
    } finally {
      setSaving(false);
    }
  }

  if (!marina) {
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

  // Precio orientativo de la estadía con las tarifas por noche que apliquen a la eslora.
  const boatLength = Number(length);
  const quotes =
    boatLength > 0 && nights > 0
      ? marina.rates
          .filter((rate) => rate.unit.endsWith('night'))
          .map((rate) => ({ rate, perNight: estimate(rate, boatLength) }))
          .filter((q): q is { rate: (typeof q)['rate']; perNight: number } => q.perNight !== null)
      : [];
  const hasFieldError = Object.values(errors).some(Boolean);
  const limits = [
    marina.max_length_m ? t('marinas.upToLength', { value: marina.max_length_m }) : null,
    marina.max_draft_m ? t('marinas.depthValue', { value: marina.max_draft_m }) : null,
  ].filter(Boolean);

  return (
    <Screen>
      <Card>
        <Text style={[typography.body, { fontWeight: '700' }]}>{marina.name}</Text>
        <Text style={typography.caption}>{[marina.city, marina.country_name].join(' · ')}</Text>
        {limits.length ? <Text style={typography.caption}>{limits.join(' · ')}</Text> : null}
        <Text style={typography.caption}>{t('berth.howItWorks')}</Text>
      </Card>

      <Text style={styles.section}>{t('berth.boat')}</Text>
      {boats.length > 0 ? (
        <FormSection label={t('berth.myBoats')}>
          <ChipGroup>
            {boats.map((b) => (
              <Chip key={b.id} label={b.sail_number ? `${b.name} · ${b.sail_number}` : b.name} selected={boat === b.id} onPress={() => pickBoat(b)} />
            ))}
          </ChipGroup>
        </FormSection>
      ) : null}
      <TextField label={t('berth.boatName')} value={boatName} onChangeText={setBoatName} error={errors.boatName} />
      <FormSection label={t('berth.boatType')}>
        <ChipGroup>
          {BOAT_TYPES.map((type) => (
            <Chip key={type} label={t(`berth.types.${type}`)} selected={boatType === type} onPress={() => setBoatType(type)} />
          ))}
        </ChipGroup>
      </FormSection>
      <View style={styles.row}>
        <View style={styles.third}>
          <TextField label={t('berth.length')} value={length} onChangeText={(v) => setLength(meters(v))} keyboardType="decimal-pad" placeholder="12" error={errors.length} />
        </View>
        <View style={styles.third}>
          <TextField label={t('berth.beam')} value={beam} onChangeText={(v) => setBeam(meters(v))} keyboardType="decimal-pad" placeholder="3.9" />
        </View>
        <View style={styles.third}>
          <TextField label={t('berth.draft')} value={draft} onChangeText={(v) => setDraft(meters(v))} keyboardType="decimal-pad" placeholder="2.1" error={errors.draft} />
        </View>
      </View>

      <Text style={styles.section}>{t('berth.dates')}</Text>
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label={t('berth.arrival')}
            value={arrival}
            onChangeText={(v) => setArrival(dateInput(v))}
            placeholder={t('result.datePlaceholder')}
            keyboardType="numbers-and-punctuation"
            error={errors.arrival}
          />
        </View>
        <View style={styles.half}>
          <TextField
            label={t('berth.departure')}
            value={departure}
            onChangeText={(v) => setDeparture(dateInput(v))}
            placeholder={t('result.datePlaceholder')}
            keyboardType="numbers-and-punctuation"
            error={errors.departure}
          />
        </View>
      </View>
      {nights > 0 ? <Text style={typography.caption}>{t('berth.nights', { count: nights })}</Text> : null}

      {quotes.length ? (
        <Card>
          <Text style={typography.label}>{t('berth.estimate')}</Text>
          {quotes.map(({ rate, perNight }) => (
            <Text key={rate.id} style={typography.body}>
              {rate.label}: <Text style={{ fontWeight: '800' }}>{formatMoney(perNight * nights, rate.currency, i18n.language)}</Text>
            </Text>
          ))}
          <Text style={typography.caption}>{t('marinas.pricesDisclaimer')}</Text>
        </Card>
      ) : null}

      <Text style={styles.section}>{t('berth.contact')}</Text>
      <TextField label={t('berth.contactName')} value={name} onChangeText={setName} />
      <TextField label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
      <TextField label={t('berth.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+54 9 11 1234 5678" />
      <TextField label={t('berth.message')} value={message} onChangeText={setMessage} multiline placeholder={t('berth.messagePlaceholder')} />

      {apiError && !hasFieldError ? <Text style={{ color: colors.danger }}>{errorMessage(apiError, t)}</Text> : null}
      <Button title={t('berth.submit')} onPress={submit} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...typography.heading, fontSize: 17, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  third: { flex: 1 },
});
