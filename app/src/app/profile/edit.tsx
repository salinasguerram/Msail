import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getCountries, getRegions, searchClubs, type Club, type Country, type Region } from '@/api/catalogs';
import {
  EXPERIENCE_LEVELS,
  getMyProfile,
  SAILING_ROLES,
  updateMyProfile,
  type ExperienceLevel,
  type SailingRole,
  type SailorProfile,
} from '@/api/profiles';
import { useBoatClasses } from '@/api/useBoatClasses';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage, fieldError } from '@/auth/errors';
import { withAuth } from '@/auth/withAuth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { useDialogs } from '@/components/Dialogs';
import { FormSection, ToggleRow } from '@/components/FormSection';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { colors, spacing, typography } from '@/theme';
import { goBack } from '@/utils/navigation';

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default withAuth(EditProfileScreen);

function EditProfileScreen() {
  const { t, i18n } = useTranslation();
  const { user, updateMe } = useAuth();
  const classes = useBoatClasses();
  const { notify } = useDialogs();
  const [profile, setProfile] = useState<SailorProfile | null>(null);

  // Datos de la cuenta
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [emailNotifications, setEmailNotifications] = useState(user?.email_notifications ?? true);
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  // Dónde navega
  const [country, setCountry] = useState<string | null>(user?.country ?? null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [city, setCity] = useState('');
  // Navegación
  const [bio, setBio] = useState('');
  const [level, setLevel] = useState<ExperienceLevel | ''>('');
  const [since, setSince] = useState('');
  const [roles, setRoles] = useState<SailingRole[]>([]);
  const [boatClasses, setBoatClasses] = useState<string[]>([]);
  const [crew, setCrew] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        setBio(p.bio);
        setCity(p.city);
        setRegionId(p.region?.id ?? null);
        setClub(p.home_club ? { ...p.home_club, slug: '', is_verified: false } : null);
        setLevel(p.experience_level);
        setSince(p.sailing_since?.toString() ?? '');
        setRoles(p.roles);
        setBoatClasses(p.boat_classes);
        setCrew(p.available_as_crew);
        setIsPublic(p.is_public);
      })
      .catch(setApiError);
  }, []);

  useEffect(() => {
    getCountries().then(setCountries).catch(() => {});
  }, [i18n.language]);

  // Regiones y clubes dependen del país elegido.
  useEffect(() => {
    if (!country) {
      setRegions([]);
      setClubs([]);
      return;
    }
    getRegions(country).then(setRegions).catch(() => setRegions([]));
    searchClubs({ country }).then(setClubs).catch(() => setClubs([]));
  }, [country]);

  function changeCountry(next: string | null) {
    if (next === country) return;
    setCountry(next);
    setRegionId(null);
    setClub(null);
  }

  const year = since.trim() ? Number(since) : null;
  const yearInvalid = year !== null && (!Number.isInteger(year) || year < 1930 || year > new Date().getFullYear());
  const nameMissing = submitted && (!firstName.trim() || !lastName.trim());

  async function save() {
    setSubmitted(true);
    if (yearInvalid || !firstName.trim() || !lastName.trim()) return;
    setSaving(true);
    setApiError(null);
    try {
      // Primero la cuenta (el país), así la región se valida contra el país nuevo.
      await updateMe({ first_name: firstName.trim(), last_name: lastName.trim(), country, email_notifications: emailNotifications });
      await updateMyProfile({
        bio: bio.trim(),
        city: city.trim(),
        region_id: regionId,
        home_club_id: club?.id ?? null,
        experience_level: level,
        sailing_since: year,
        roles,
        boat_classes: boatClasses,
        available_as_crew: crew,
        is_public: isPublic,
      });
      notify(t('editProfile.saved'));
      goBack('/profile');
    } catch (e) {
      setApiError(e);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
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

  const clubOptions = [...(club && !clubs.some((c) => c.id === club.id) ? [club] : []), ...clubs].map((c) => ({
    value: String(c.id),
    label: c.name,
    hint: c.city,
  }));
  const knownFieldErrors = ['first_name', 'last_name', 'country', 'region_id', 'home_club_id', 'bio', 'city', 'sailing_since', 'roles', 'boat_classes'];
  const generalError = apiError && !knownFieldErrors.some((f) => fieldError(apiError, f)) ? errorMessage(apiError, t) : null;

  return (
    <Screen>
      <Text style={styles.section}>{t('editProfile.personal')}</Text>
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label={t('auth.firstName')}
            value={firstName}
            onChangeText={setFirstName}
            autoComplete="given-name"
            error={(nameMissing && !firstName.trim() ? t('auth.required') : undefined) ?? fieldError(apiError, 'first_name')}
          />
        </View>
        <View style={styles.half}>
          <TextField
            label={t('auth.lastName')}
            value={lastName}
            onChangeText={setLastName}
            autoComplete="family-name"
            error={(nameMissing && !lastName.trim() ? t('auth.required') : undefined) ?? fieldError(apiError, 'last_name')}
          />
        </View>
      </View>
      <TextField
        label={t('editProfile.bio')}
        value={bio}
        onChangeText={setBio}
        placeholder={t('editProfile.bioPlaceholder')}
        multiline
        maxLength={1000}
        style={{ minHeight: 110, paddingTop: spacing.md, textAlignVertical: 'top' }}
        error={fieldError(apiError, 'bio')}
      />

      <Text style={styles.section}>{t('editProfile.location')}</Text>
      <SelectField
        label={t('editProfile.country')}
        value={country}
        options={countries.map((c) => ({ value: c.iso_code, label: c.name }))}
        onChange={changeCountry}
        error={fieldError(apiError, 'country')}
      />
      <SelectField
        label={t('editProfile.region')}
        value={regionId ? String(regionId) : null}
        options={regions.map((r) => ({ value: String(r.id), label: r.name }))}
        onChange={(v) => setRegionId(v ? Number(v) : null)}
        disabled={!country}
        disabledHint={t('editProfile.regionHint')}
        emptyText={t('editProfile.regionEmpty')}
        error={fieldError(apiError, 'region_id')}
      />
      <SelectField
        label={t('editProfile.club')}
        value={club ? String(club.id) : null}
        options={clubOptions}
        onChange={(v) => setClub(v ? (clubs.find((c) => String(c.id) === v) ?? club) : null)}
        onSearch={(q) => searchClubs({ search: q, country }).then(setClubs).catch(() => {})}
        emptyText={t('editProfile.clubEmpty')}
        error={fieldError(apiError, 'home_club_id')}
      />
      <TextField label={t('editProfile.city')} value={city} onChangeText={setCity} error={fieldError(apiError, 'city')} />

      <Text style={styles.section}>{t('editProfile.sailing')}</Text>
      <TextField
        label={t('editProfile.sailingSince')}
        value={since}
        onChangeText={(v) => setSince(v.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        placeholder="2010"
        error={yearInvalid ? t('editProfile.invalidYear') : fieldError(apiError, 'sailing_since')}
      />

      <FormSection label={t('editProfile.level')}>
        <ChipGroup>
          {EXPERIENCE_LEVELS.map((value) => (
            <Chip
              key={value}
              label={t(`sailor.experience.${value}`)}
              selected={level === value}
              onPress={() => setLevel(level === value ? '' : value)}
            />
          ))}
        </ChipGroup>
      </FormSection>

      <FormSection label={t('editProfile.roles')} error={fieldError(apiError, 'roles')}>
        <ChipGroup>
          {SAILING_ROLES.map((role) => (
            <Chip
              key={role}
              label={t(`sailor.roles.${role}`)}
              selected={roles.includes(role)}
              onPress={() => setRoles((r) => toggle(r, role))}
            />
          ))}
        </ChipGroup>
      </FormSection>

      <FormSection label={t('editProfile.classes')} error={fieldError(apiError, 'boat_classes')}>
        <ChipGroup>
          {classes.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              selected={boatClasses.includes(c.slug)}
              onPress={() => setBoatClasses((list) => toggle(list, c.slug))}
            />
          ))}
        </ChipGroup>
      </FormSection>

      <Card>
        <ToggleRow
          label={t('editProfile.availableAsCrew')}
          hint={t('editProfile.availableAsCrewHint')}
          value={crew}
          onChange={setCrew}
        />
        <ToggleRow
          label={t('editProfile.isPublic')}
          hint={t('editProfile.isPublicHint')}
          value={isPublic}
          onChange={setIsPublic}
        />
        <ToggleRow
          label={t('editProfile.emailNotifications')}
          hint={t('editProfile.emailNotificationsHint')}
          value={emailNotifications}
          onChange={setEmailNotifications}
        />
      </Card>

      {generalError ? <Text style={{ color: colors.danger }}>{generalError}</Text> : null}
      <Button title={t('editProfile.save')} onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...typography.heading, fontSize: 17, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});
