import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getMyBoats, type BoatSummary } from '@/api/boats';
import { api } from '@/api/client';
import {
  createResult,
  deleteResult,
  SAILING_ROLES,
  updateResult,
  type RaceResult,
  type SailingRole,
} from '@/api/profiles';
import { useBoatClasses } from '@/api/useBoatClasses';
import { errorMessage, fieldError } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Chip, ChipGroup } from '@/components/Chip';
import { confirmAction, FormSection } from '@/components/FormSection';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/theme';
import { goBack } from '@/utils/navigation';

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export default function ResultScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const classes = useBoatClasses();

  const [loaded, setLoaded] = useState(!id);
  const [event, setEvent] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [boatClass, setBoatClass] = useState<string | null>(null);
  const [boat, setBoat] = useState<number | null>(null);
  const [myBoats, setMyBoats] = useState<BoatSummary[]>([]);
  const [boatName, setBoatName] = useState('');
  const [role, setRole] = useState<SailingRole | ''>('');
  const [position, setPosition] = useState('');
  const [fleet, setFleet] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t(id ? 'result.editTitle' : 'result.newTitle') });
  }, [navigation, id, t]);

  useEffect(() => {
    getMyBoats().then(setMyBoats).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    api<RaceResult>(`/profiles/me/results/${id}/`)
      .then((r) => {
        setEvent(r.event_name);
        setDate(r.date);
        setLocation(r.location);
        setBoatClass(r.boat_class);
        setBoat(r.boat);
        setBoatName(r.boat_name);
        setRole(r.role);
        setPosition(String(r.position));
        setFleet(r.fleet_size ? String(r.fleet_size) : '');
        setLoaded(true);
      })
      .catch(setApiError);
  }, [id]);

  const positionNumber = Number(position);
  const fleetNumber = fleet ? Number(fleet) : null;
  const errors = {
    event: submitted && !event.trim() ? t('auth.required') : fieldError(apiError, 'event_name'),
    date: submitted && !isDate(date) ? t('result.invalidDate') : fieldError(apiError, 'date'),
    position: submitted && !(positionNumber >= 1) ? t('result.invalidNumber') : fieldError(apiError, 'position'),
    fleet: fieldError(apiError, 'fleet_size'),
  };

  async function save() {
    setSubmitted(true);
    setApiError(null);
    if (!event.trim() || !isDate(date) || !(positionNumber >= 1)) return;
    const data = {
      event_name: event.trim(),
      date,
      location: location.trim(),
      boat_class: boatClass,
      boat,
      boat_name: boatName.trim(),
      role,
      position: positionNumber,
      fleet_size: fleetNumber,
    };
    setSaving(true);
    try {
      if (id) await updateResult(Number(id), data);
      else await createResult(data);
      goBack('/profile');
    } catch (e) {
      setApiError(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id) return;
    const ok = await confirmAction(t('result.confirmDelete'), t('result.delete'), t('common.cancel'));
    if (!ok) return;
    try {
      await deleteResult(Number(id));
      goBack('/profile');
    } catch (e) {
      setApiError(e);
    }
  }

  if (!loaded) {
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
      <TextField
        label={t('result.event')}
        value={event}
        onChangeText={setEvent}
        placeholder={t('result.eventPlaceholder')}
        error={errors.event}
      />
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label={t('result.date')}
            value={date}
            onChangeText={(v) => setDate(v.replace(/[^\d-]/g, '').slice(0, 10))}
            placeholder={t('result.datePlaceholder')}
            keyboardType="numbers-and-punctuation"
            error={errors.date}
          />
        </View>
        <View style={styles.half}>
          <TextField label={t('result.location')} value={location} onChangeText={setLocation} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label={t('result.position')}
            value={position}
            onChangeText={(v) => setPosition(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="1"
            error={errors.position}
          />
        </View>
        <View style={styles.half}>
          <TextField
            label={t('result.fleetSize')}
            value={fleet}
            onChangeText={(v) => setFleet(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="24"
            error={errors.fleet}
          />
        </View>
      </View>
      {myBoats.length > 0 && (
        <FormSection label={t('result.boat')} error={fieldError(apiError, 'boat')}>
          <ChipGroup>
            {myBoats.map((b) => (
              <Chip
                key={b.id}
                label={b.sail_number ? `${b.name} · ${b.sail_number}` : b.name}
                selected={boat === b.id}
                onPress={() => {
                  const next = boat === b.id ? null : b.id;
                  setBoat(next);
                  // Al elegir un barco propio se completan nombre y clase.
                  if (next) {
                    setBoatName(b.name);
                    if (b.boat_class) setBoatClass(b.boat_class);
                  }
                }}
              />
            ))}
          </ChipGroup>
        </FormSection>
      )}
      <TextField label={t('result.boatName')} value={boatName} onChangeText={setBoatName} />

      <FormSection label={t('result.boatClass')}>
        <ChipGroup>
          {classes.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              selected={boatClass === c.slug}
              onPress={() => setBoatClass(boatClass === c.slug ? null : c.slug)}
            />
          ))}
        </ChipGroup>
      </FormSection>

      <FormSection label={t('result.role')}>
        <ChipGroup>
          {SAILING_ROLES.map((r) => (
            <Chip key={r} label={t(`sailor.roles.${r}`)} selected={role === r} onPress={() => setRole(role === r ? '' : r)} />
          ))}
        </ChipGroup>
      </FormSection>

      {apiError && !hasFieldError ? <Text style={{ color: colors.danger }}>{errorMessage(apiError, t)}</Text> : null}
      <Button title={t('result.save')} onPress={save} loading={saving} />
      {id ? <Button title={t('result.delete')} variant="ghost" onPress={remove} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});
