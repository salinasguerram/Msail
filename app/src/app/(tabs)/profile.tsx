import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getMyBoats, type BoatSummary } from '@/api/boats';
import { ADMIN_URL } from '@/api/client';
import { deleteAvatar, deleteProfilePhoto, pickImage, uploadAvatar, uploadProfilePhoto } from '@/api/photos';
import { getMyProfile, type RaceResult, type SailorProfile } from '@/api/profiles';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { useAuth, type User } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { useDialogs } from '@/components/Dialogs';
import { LanguagePicker } from '@/components/LanguagePicker';
import { PhotoGallery } from '@/components/PhotoGallery';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';
import { PremiumEntry } from '@/components/Premium';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) {
    return (
      <Screen>
        <Card style={styles.guest}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color={colors.primary} />
          </View>
          <Text style={[typography.heading, styles.center]}>{t('profile.guestTitle')}</Text>
          <Text style={[typography.caption, styles.center]}>{t('profile.guestText')}</Text>
          <View style={styles.actions}>
            <Button title={t('profile.register')} onPress={() => router.push('/register')} />
            <Button title={t('profile.login')} variant="secondary" onPress={() => router.push('/login')} />
          </View>
        </Card>
        <LanguageCard />
        <LegalLinks />
      </Screen>
    );
  }

  return <SignedInProfile user={user} />;
}

function SignedInProfile({ user }: { user: User }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { confirm, choose, notify } = useDialogs();
  const classes = useBoatClasses();
  const [profile, setProfile] = useState<SailorProfile | null>(null);
  const [boats, setBoats] = useState<BoatSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function changeAvatar() {
    setPhotoError(null);
    if (profile?.avatar) {
      const choice = await choose({
        title: t('photos.changeAvatar'),
        choices: [
          { key: 'change', label: t('photos.chooseAvatar') },
          { key: 'remove', label: t('photos.removeAvatar'), destructive: true },
        ],
      });
      if (choice === 'remove') {
        if (!(await confirm({ title: t('photos.confirmRemoveAvatar'), confirmLabel: t('photos.removeAvatar'), destructive: true }))) return;
        setAvatarBusy(true);
        try {
          await deleteAvatar();
          setProfile((p) => (p ? { ...p, avatar: null } : p));
          notify(t('photos.avatarRemoved'));
        } catch (e) {
          notify(errorMessage(e, t), 'error');
        } finally {
          setAvatarBusy(false);
        }
        return;
      }
      if (choice !== 'change') return;
    }
    const asset = await pickImage({ square: true });
    if (!asset) return;
    setAvatarBusy(true);
    try {
      const { avatar } = await uploadAvatar(asset);
      setProfile((p) => (p ? { ...p, avatar } : p));
      notify(t('photos.avatarUpdated'));
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function addPhoto() {
    setPhotoError(null);
    const asset = await pickImage();
    if (!asset) return;
    setUploading(true);
    try {
      const photo = await uploadProfilePhoto(asset);
      setProfile((p) => (p ? { ...p, photos: [photo, ...p.photos] } : p));
      notify(t('photos.added'));
    } catch (e) {
      setPhotoError(errorMessage(e, t));
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(id: number) {
    if (!(await confirm({ title: t('photos.confirmDelete'), message: t('photos.confirmDeleteText'), confirmLabel: t('photos.delete'), destructive: true }))) return;
    try {
      await deleteProfilePhoto(id);
      setProfile((p) => (p ? { ...p, photos: p.photos.filter((x) => x.id !== id) } : p));
      notify(t('photos.deleted'));
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    }
  }

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([getMyProfile(), getMyBoats()])
      .then(([p, b]) => {
        setProfile(p);
        setBoats(b);
      })
      .catch(() => setFailed(true));
  }, []);

  // Recarga al volver de editar el perfil o un resultado.
  useFocusEffect(load);

  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase() || user.email[0].toUpperCase();

  return (
    <Screen>
      {!user.email_verified && (
        <Pressable style={styles.banner} onPress={() => router.push('/verify-email')} accessibilityRole="button">
          <Ionicons name="mail-unread-outline" size={20} color={colors.warning} />
          <Text style={styles.bannerText}>{t('profile.verifyBanner')}</Text>
          <Text style={styles.bannerAction}>{t('profile.verifyAction')}</Text>
        </Pressable>
      )}

      <Card style={styles.header}>
        <Avatar uri={profile?.avatar} initials={initials} loading={avatarBusy} onPress={profile ? changeAvatar : undefined} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={typography.heading}>
            {user.first_name} {user.last_name}
          </Text>
          <Text style={typography.caption}>{user.email}</Text>
          {user.email_verified && (
            <View style={styles.inline}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={[typography.caption, { color: colors.success }]}>{t('profile.verified')}</Text>
            </View>
          )}
        </View>
      </Card>

      {user.is_staff ? (
        <Pressable style={styles.admin} onPress={() => Linking.openURL(ADMIN_URL)} accessibilityRole="link">
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.body, { fontWeight: '700' }]}>{t('profile.admin')}</Text>
            <Text style={typography.caption}>{t('profile.adminText')}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <PremiumEntry
        active={!!user.is_premium}
        text={user.is_premium ? t('premium.profileActive') : t('premium.profileInvite')}
      />

      {!profile && !failed && <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />}

      {failed && (
        <Card style={{ alignItems: 'center' }}>
          <Text style={typography.caption}>{t('profile.loadError')}</Text>
          <Button title={t('profile.retry')} variant="ghost" onPress={load} />
        </Card>
      )}

      {profile && (
        <>
          <View style={styles.stats}>
            <Stat value={profile.stats.regattas} label={t('profile.statsRegattas')} />
            <Stat value={profile.stats.podiums} label={t('profile.statsPodiums')} />
            <Stat value={profile.stats.wins} label={t('profile.statsWins')} />
          </View>

          <Card>
            <View style={styles.cardHeader}>
              <Text style={typography.label}>{t('profile.sailorProfile')}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/profile/edit')} hitSlop={8}>
                <Text style={styles.link}>{t('profile.edit')}</Text>
              </Pressable>
            </View>
            <Text style={[typography.body, !profile.bio && { color: colors.textMuted }]}>
              {profile.bio || t('profile.emptyBio')}
            </Text>
            <InfoRow
              label={t('profile.level')}
              value={profile.experience_level ? t(`sailor.experience.${profile.experience_level}`) : null}
            />
            <InfoRow label={t('profile.sailingSince')} value={profile.sailing_since?.toString()} />
            <InfoRow label={t('editProfile.region')} value={profile.region?.name} />
            <InfoRow label={t('profile.club')} value={profile.home_club?.name} />
            <InfoRow label={t('profile.city')} value={profile.city} />
            {profile.available_as_crew && (
              <View style={[styles.inline, { marginTop: spacing.xs }]}>
                <Ionicons name="people" size={16} color={colors.success} />
                <Text style={[typography.caption, { color: colors.success }]}>{t('profile.availableAsCrew')}</Text>
              </View>
            )}
          </Card>

          {profile.roles.length > 0 && (
            <Card>
              <Text style={typography.label}>{t('profile.roles')}</Text>
              <ChipGroup>
                {profile.roles.map((role) => (
                  <Chip key={role} label={t(`sailor.roles.${role}`)} />
                ))}
              </ChipGroup>
            </Card>
          )}

          {profile.boat_classes.length > 0 && (
            <Card>
              <Text style={typography.label}>{t('profile.classes')}</Text>
              <ChipGroup>
                {profile.boat_classes.map((slug) => (
                  <Chip key={slug} label={className(classes, slug)} />
                ))}
              </ChipGroup>
            </Card>
          )}

          <Card>
            <Text style={typography.label}>{t('photos.title')}</Text>
            {profile.photos.length === 0 ? <Text style={typography.caption}>{t('photos.emptyProfile')}</Text> : null}
            <PhotoGallery
              photos={profile.photos}
              editable
              uploading={uploading}
              onAdd={addPhoto}
              onDelete={(photo) => removePhoto(photo.id)}
            />
            {photoError ? <Text style={{ color: colors.danger }}>{photoError}</Text> : null}
          </Card>

          <Card>
            <View style={styles.cardHeader}>
              <Text style={typography.label}>{t('boats.myBoats')}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/boats/edit')} hitSlop={8}>
                <Text style={styles.link}>+ {t('boats.add')}</Text>
              </Pressable>
            </View>
            {boats.length === 0 ? (
              <Text style={typography.caption}>{t('boats.empty')}</Text>
            ) : (
              boats.map((boat) => (
                <BoatRow key={boat.id} boat={boat} classLabel={className(classes, boat.boat_class)} />
              ))
            )}
          </Card>

          <Card>
            <View style={styles.cardHeader}>
              <Text style={typography.label}>{t('profile.results')}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/profile/result')} hitSlop={8}>
                <Text style={styles.link}>+ {t('profile.addResult')}</Text>
              </Pressable>
            </View>
            {profile.results.length === 0 ? (
              <Text style={typography.caption}>{t('profile.noResults')}</Text>
            ) : (
              profile.results.map((result) => (
                <ResultRow key={result.id} result={result} classLabel={className(classes, result.boat_class)} />
              ))
            )}
          </Card>
        </>
      )}

      <LanguageCard />

      <Button
        title={t('profile.logout')}
        variant="secondary"
        loading={loggingOut}
        onPress={async () => {
          setLoggingOut(true);
          await logout();
          setLoggingOut(false);
        }}
      />

      <LegalLinks />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/profile/delete-account')}
        style={({ pressed }) => [styles.deleteAccount, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.deleteAccountText}>{t('deleteAccount.title')}</Text>
      </Pressable>
    </Screen>
  );
}

/** Política de privacidad y términos (las tiendas piden que estén a mano en la app). */
function LegalLinks() {
  const { t } = useTranslation();
  return (
    <View style={styles.legalRow}>
      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[key]', params: { key: 'privacy' } })} hitSlop={8}>
        <Text style={styles.legalLink}>{t('legal.privacy')}</Text>
      </Pressable>
      <Text style={typography.caption}>·</Text>
      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[key]', params: { key: 'terms' } })} hitSlop={8}>
        <Text style={styles.legalLink}>{t('legal.terms')}</Text>
      </Pressable>
    </View>
  );
}

function LanguageCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <Text style={typography.label}>{t('profile.language')}</Text>
      <LanguagePicker />
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={typography.caption}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[typography.body, { flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

function BoatRow({ boat, classLabel }: { boat: BoatSummary; classLabel: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/boats/[id]', params: { id: String(boat.id) } })}
      style={({ pressed }) => [styles.result, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.position}>
        {boat.cover ? (
          <Image source={{ uri: boat.cover }} style={styles.cover} />
        ) : (
          <Ionicons name="boat-outline" size={22} color={colors.primary} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.body, { fontWeight: '600' }]} numberOfLines={1}>
          {boat.name}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {[boat.sail_number, classLabel, boat.home_port].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function ResultRow({ result, classLabel }: { result: RaceResult; classLabel: string }) {
  const { t } = useTranslation();
  const podium = result.position <= 3;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/profile/result', params: { id: String(result.id) } })}
      style={({ pressed }) => [styles.result, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.position, podium && styles.podium]}>
        <Text style={[styles.positionText, podium && { color: '#fff' }]}>{result.position}º</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.body, { fontWeight: '600' }]} numberOfLines={1}>
          {result.event_name}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {[result.date.slice(0, 4), classLabel, result.fleet_size ? t('result.of', { count: result.fleet_size }) : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  legalLink: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
  deleteAccount: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, padding: spacing.sm },
  deleteAccountText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  admin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  guest: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  center: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: colors.text, fontSize: 22, fontWeight: '800' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
  },
  bannerText: { flex: 1, color: colors.text, fontSize: 14 },
  bannerAction: { color: colors.warning, fontWeight: '700', fontSize: 14 },
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  position: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  podium: { backgroundColor: colors.primary, borderColor: colors.primary },
  cover: { width: 44, height: 44 },
  positionText: { color: colors.text, fontWeight: '800', fontSize: 15 },
});
