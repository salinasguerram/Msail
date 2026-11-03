import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { createBoat, deleteBoat, getBoat, updateBoat, type BoatInput } from '@/api/boats';
import { useBoatClasses } from '@/api/useBoatClasses';
import { errorMessage, fieldError } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { confirmAction, FormSection, ToggleRow } from '@/components/FormSection';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/theme';
import { goBack } from '@/utils/navigation';

type Form = {
  name: string;
  sail_number: string;
  model: string;
  builder: string;
  designer: string;
  year_built: string;
  hull_color: string;
  length_m: string;
  beam_m: string;
  draft_m: string;
  displacement_kg: string;
  rating: string;
  home_port: string;
  description: string;
};

const EMPTY: Form = {
  name: '',
  sail_number: '',
  model: '',
  builder: '',
  designer: '',
  year_built: '',
  hull_color: '',
  length_m: '',
  beam_m: '',
  draft_m: '',
  displacement_kg: '',
  rating: '',
  home_port: '',
  description: '',
};

const DECIMALS = ['length_m', 'beam_m', 'draft_m'] as const;
const INTEGERS = ['year_built', 'displacement_kg'] as const;

const isNumber = (value: string) => value === '' || (/^\d+([.,]\d{1,2})?$/.test(value) && Number(value.replace(',', '.')) > 0);

export default function BoatFormScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const classes = useBoatClasses();
  const [form, setForm] = useState<Form>(EMPTY);
  const [boatClass, setBoatClass] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [loaded, setLoaded] = useState(!id);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t(id ? 'boats.editTitle' : 'boats.newTitle') });
  }, [navigation, id, t]);

  useEffect(() => {
    if (!id) return;
    getBoat(Number(id))
      .then((boat) => {
        const next = { ...EMPTY };
        for (const key of Object.keys(EMPTY) as (keyof Form)[]) {
          const value = boat[key];
          next[key] = value === null || value === undefined ? '' : String(value);
        }
        setForm(next);
        setBoatClass(boat.boat_class);
        setIsPublic(boat.is_public);
        setLoaded(true);
      })
      .catch(setApiError);
  }, [id]);

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const numberError = (key: (typeof DECIMALS)[number] | (typeof INTEGERS)[number]) => {
    const value = form[key].trim();
    const valid = (INTEGERS as readonly string[]).includes(key) ? value === '' || /^\d+$/.test(value) : isNumber(value);
    return (submitted && !valid ? t('boats.invalidNumber') : undefined) ?? fieldError(apiError, key);
  };

  const errors = {
    name: (submitted && !form.name.trim() ? t('auth.required') : undefined) ?? fieldError(apiError, 'name'),
    year_built: numberError('year_built'),
    length_m: numberError('length_m'),
    beam_m: numberError('beam_m'),
    draft_m: numberError('draft_m'),
    displacement_kg: numberError('displacement_kg'),
  };

  async function save() {
    setSubmitted(true);
    setApiError(null);
    const localInvalid =
      !form.name.trim() ||
      DECIMALS.some((k) => !isNumber(form[k].trim())) ||
      INTEGERS.some((k) => form[k].trim() !== '' && !/^\d+$/.test(form[k].trim()));
    if (localInvalid) return;

    const decimal = (v: string) => (v.trim() ? v.trim().replace(',', '.') : null);
    const integer = (v: string) => (v.trim() ? Number(v) : null);
    const data: BoatInput = {
      name: form.name.trim(),
      boat_class: boatClass,
      sail_number: form.sail_number.trim(),
      model: form.model.trim(),
      builder: form.builder.trim(),
      designer: form.designer.trim(),
      year_built: integer(form.year_built),
      hull_color: form.hull_color.trim(),
      length_m: decimal(form.length_m),
      beam_m: decimal(form.beam_m),
      draft_m: decimal(form.draft_m),
      displacement_kg: integer(form.displacement_kg),
      rating: form.rating.trim(),
      home_port: form.home_port.trim(),
      description: form.description.trim(),
      is_public: isPublic,
    };
    setSaving(true);
    try {
      if (id) await updateBoat(Number(id), data);
      else await createBoat(data);
      goBack('/profile');
    } catch (e) {
      setApiError(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id) return;
    if (!(await confirmAction(t('boats.confirmDelete'), t('boats.delete'), t('common.cancel')))) return;
    try {
      await deleteBoat(Number(id));
      // El detalle de la embarcación ya no existe: se vuelve directo al perfil.
      router.dismissTo('/profile');
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
  const decimalInput = { keyboardType: 'decimal-pad' as const, placeholder: '0.00' };

  return (
    <Screen>
      <TextField
        label={t('boats.name')}
        value={form.name}
        onChangeText={set('name')}
        placeholder={t('boats.namePlaceholder')}
        error={errors.name}
      />
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField label={t('boats.sailNumber')} value={form.sail_number} onChangeText={set('sail_number')} autoCapitalize="characters" />
        </View>
        <View style={styles.half}>
          <TextField
            label={t('boats.yearBuilt')}
            value={form.year_built}
            onChangeText={(v) => set('year_built')(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            error={errors.year_built}
          />
        </View>
      </View>

      <FormSection label={t('boats.boatClass')}>
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

      <TextField label={t('boats.model')} value={form.model} onChangeText={set('model')} placeholder={t('boats.modelPlaceholder')} />
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField label={t('boats.builder')} value={form.builder} onChangeText={set('builder')} />
        </View>
        <View style={styles.half}>
          <TextField label={t('boats.designer')} value={form.designer} onChangeText={set('designer')} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.third}>
          <TextField label={t('boats.length')} value={form.length_m} onChangeText={set('length_m')} error={errors.length_m} {...decimalInput} />
        </View>
        <View style={styles.third}>
          <TextField label={t('boats.beam')} value={form.beam_m} onChangeText={set('beam_m')} error={errors.beam_m} {...decimalInput} />
        </View>
        <View style={styles.third}>
          <TextField label={t('boats.draft')} value={form.draft_m} onChangeText={set('draft_m')} error={errors.draft_m} {...decimalInput} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label={t('boats.displacement')}
            value={form.displacement_kg}
            onChangeText={(v) => set('displacement_kg')(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            error={errors.displacement_kg}
          />
        </View>
        <View style={styles.half}>
          <TextField label={t('boats.hullColor')} value={form.hull_color} onChangeText={set('hull_color')} />
        </View>
      </View>
      <TextField label={t('boats.rating')} value={form.rating} onChangeText={set('rating')} placeholder={t('boats.ratingPlaceholder')} />
      <TextField label={t('boats.homePort')} value={form.home_port} onChangeText={set('home_port')} />
      <TextField
        label={t('boats.description')}
        value={form.description}
        onChangeText={set('description')}
        multiline
        maxLength={2000}
        style={{ minHeight: 100, paddingTop: spacing.md, textAlignVertical: 'top' }}
      />

      <Card>
        <ToggleRow label={t('boats.isPublic')} hint={t('boats.isPublicHint')} value={isPublic} onChange={setIsPublic} />
      </Card>

      {apiError && !hasFieldError ? <Text style={{ color: colors.danger }}>{errorMessage(apiError, t)}</Text> : null}
      <Button title={t('boats.save')} onPress={save} loading={saving} />
      {id ? <Button title={t('boats.delete')} variant="ghost" onPress={remove} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  third: { flex: 1 },
});
