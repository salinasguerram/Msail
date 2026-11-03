import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addCrew, type Boat } from '@/api/boats';
import { ApiError } from '@/api/client';
import { lookupSailor, SAILING_ROLES, type CrewCandidate, type SailingRole } from '@/api/profiles';
import { errorMessage, fieldError, isEmail } from '@/auth/errors';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Chip, ChipGroup } from '@/components/Chip';
import { useDialogs } from '@/components/Dialogs';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing, typography } from '@/theme';

const initialsOf = (first: string, last: string) => `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?';

/**
 * Agregar tripulante: se busca su cuenta de MSAIL por email, así no hay confusión entre
 * dos personas con el mismo nombre. Si todavía no tiene cuenta, se puede cargar solo con el nombre.
 */
export function CrewSearch({ boat, onAdded }: { boat: Boat; onAdded: () => void }) {
  const { t } = useTranslation();
  const { notify } = useDialogs();
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<CrewCandidate | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<SailingRole | ''>('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function reset() {
    setEmail('');
    setFound(null);
    setSearchError(null);
    setName('');
    setRole('');
    setManual(false);
    setError(null);
  }

  async function search() {
    setSearchError(null);
    setFound(null);
    if (!isEmail(email)) {
      setSearchError(t('auth.invalidEmail'));
      return;
    }
    setSearching(true);
    try {
      const candidate = await lookupSailor(email);
      if (candidate.user_id === boat.owner.user_id) setSearchError(t('crew.isOwner'));
      else if (boat.crew.some((m) => m.user_id === candidate.user_id)) setSearchError(t('crew.alreadyIn', { name: `${candidate.first_name} ${candidate.last_name}` }));
      else setFound(candidate);
    } catch (e) {
      setSearchError(e instanceof ApiError && e.status === 404 ? t('crew.notFound') : errorMessage(e, t));
    } finally {
      setSearching(false);
    }
  }

  async function add() {
    setAdding(true);
    setError(null);
    try {
      const member = await addCrew(boat.id, found ? { user_id: found.user_id, role } : { name: name.trim(), role });
      notify(t('crew.added', { name: member.display_name }));
      reset();
      onAdded();
    } catch (e) {
      setError(e);
    } finally {
      setAdding(false);
    }
  }

  const ready = found !== null || (manual && name.trim().length > 0);
  const apiMessage = fieldError(error, 'user_id') ?? fieldError(error, 'name') ?? (error ? errorMessage(error, t) : null);

  return (
    <View style={styles.wrapper}>
      <Text style={typography.label}>{t('crew.addTitle')}</Text>

      {manual ? (
        <TextField label={t('boats.crewName')} value={name} onChangeText={setName} onSubmitEditing={add} />
      ) : found ? (
        <View style={styles.found}>
          <Avatar uri={found.avatar} initials={initialsOf(found.first_name, found.last_name)} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { fontWeight: '700' }]}>
              {found.first_name} {found.last_name}
            </Text>
            <Text style={typography.caption}>{email.trim().toLowerCase()}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('crew.change')} hitSlop={8} onPress={() => setFound(null)}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <>
          <TextField
            label={t('crew.emailLabel')}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setSearchError(null);
            }}
            placeholder={t('crew.emailPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            error={searchError ?? undefined}
            onSubmitEditing={search}
          />
          <Text style={typography.caption}>{t('crew.emailHint')}</Text>
          <Button title={t('crew.search')} variant="secondary" onPress={search} loading={searching} disabled={!email.trim()} />
        </>
      )}

      {ready && (
        <ChipGroup>
          {SAILING_ROLES.map((r) => (
            <Chip key={r} label={t(`sailor.roles.${r}`)} selected={role === r} onPress={() => setRole(role === r ? '' : r)} />
          ))}
        </ChipGroup>
      )}

      {apiMessage ? <Text style={{ color: colors.danger }}>{apiMessage}</Text> : null}
      {ready && <Button title={t('boats.addCrew')} onPress={add} loading={adding} />}

      {!found && (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            setManual((m) => !m);
            setSearchError(null);
          }}
        >
          <Text style={styles.link}>{manual ? t('crew.backToSearch') : t('crew.notOnMsail')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
  },
  link: { color: colors.primary, fontWeight: '600', fontSize: 14, textAlign: 'center' },
});
