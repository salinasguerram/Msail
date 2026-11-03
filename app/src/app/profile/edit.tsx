import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text } from 'react-native';

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
import { errorMessage, fieldError } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { FormSection, ToggleRow } from '@/components/FormSection';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/theme';
import { goBack } from '@/utils/navigation';

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const classes = useBoatClasses();
  const [profile, setProfile] = useState<SailorProfile | null>(null);
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [level, setLevel] = useState<ExperienceLevel | ''>('');
  const [since, setSince] = useState('');
  const [roles, setRoles] = useState<SailingRole[]>([]);
  const [boatClasses, setBoatClasses] = useState<string[]>([]);
  const [crew, setCrew] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        setBio(p.bio);
        setCity(p.city);
        setLevel(p.experience_level);
        setSince(p.sailing_since?.toString() ?? '');
        setRoles(p.roles);
        setBoatClasses(p.boat_classes);
        setCrew(p.available_as_crew);
        setIsPublic(p.is_public);
      })
      .catch(setApiError);
  }, []);

  const year = since.trim() ? Number(since) : null;
  const yearInvalid = year !== null && (!Number.isInteger(year) || year < 1930 || year > new Date().getFullYear());

  async function save() {
    if (yearInvalid) return;
    setSaving(true);
    setApiError(null);
    try {
      await updateMyProfile({
        bio: bio.trim(),
        city: city.trim(),
        experience_level: level,
        sailing_since: year,
        roles,
        boat_classes: boatClasses,
        available_as_crew: crew,
        is_public: isPublic,
      });
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

  return (
    <Screen>
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
      <TextField
        label={t('editProfile.city')}
        value={city}
        onChangeText={setCity}
        error={fieldError(apiError, 'city')}
      />
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
      </Card>

      {apiError && !fieldError(apiError, 'sailing_since') ? (
        <Text style={{ color: colors.danger }}>{errorMessage(apiError, t)}</Text>
      ) : null}
      <Button title={t('editProfile.save')} onPress={save} loading={saving} />
    </Screen>
  );
}
