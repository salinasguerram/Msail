import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMeters, getBoat, removeCrew, type Boat, type CrewMember } from '@/api/boats';
import { deleteBoatPhoto, pickImage, setBoatCover, uploadBoatPhoto, type Photo } from '@/api/photos';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { errorMessage } from '@/auth/errors';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CoverPicker } from '@/components/CoverPicker';
import { CrewSearch } from '@/components/CrewSearch';
import { useDialogs } from '@/components/Dialogs';
import { PhotoGallery } from '@/components/PhotoGallery';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

export default function BoatDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const classes = useBoatClasses();
  const { confirm, notify } = useDialogs();
  const [boat, setBoat] = useState<Boat | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const [choosingCover, setChoosingCover] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getBoat(Number(id)).then(setBoat).catch(setError);
  }, [id]);

  useFocusEffect(load);

  async function addPhoto() {
    if (!boat) return;
    const asset = await pickImage();
    if (!asset) return;
    setUploading(true);
    try {
      await uploadBoatPhoto(boat.id, asset);
      notify(t('photos.added'));
      load();
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(photo: Photo) {
    if (!boat) return;
    const ok = await confirm({
      title: t('photos.confirmDelete'),
      message: photo.is_cover ? t('photos.confirmDeleteCover') : undefined,
      confirmLabel: t('photos.delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteBoatPhoto(boat.id, photo.id);
      notify(t('photos.deleted'));
      load();
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    }
  }

  async function makeCover(photo: Photo) {
    if (!boat) return;
    setChoosingCover(false);
    if (photo.is_cover) return;
    try {
      await setBoatCover(boat.id, photo.id);
      notify(t('photos.coverUpdated'));
      load();
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    }
  }

  if (!boat) {
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.danger }}>{errorMessage(error, t)}</Text>
            <Button title={t('profile.retry')} variant="ghost" onPress={load} />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        )}
      </Screen>
    );
  }

  const meters = (value: string | null) => formatMeters(value, (v) => t('boats.meters', v));
  const specs: [string, string | null | undefined][] = [
    [t('boats.boatClass'), boat.boat_class ? className(classes, boat.boat_class) : null],
    [t('boats.model'), boat.model],
    [t('boats.builder'), boat.builder],
    [t('boats.designer'), boat.designer],
    [t('boats.yearBuilt'), boat.year_built?.toString()],
    [t('boats.length'), meters(boat.length_m)],
    [t('boats.beam'), meters(boat.beam_m)],
    [t('boats.draft'), meters(boat.draft_m)],
    [t('boats.displacement'), boat.displacement_kg ? `${boat.displacement_kg.toLocaleString()} kg` : null],
    [t('boats.hullColor'), boat.hull_color],
    [t('boats.rating'), boat.rating],
    [t('boats.homePort'), boat.home_port],
  ];

  return (
    <Screen>
      {boat.cover ? (
        <View>
          <Image source={{ uri: boat.cover }} style={styles.hero} accessibilityLabel={boat.name} />
          {boat.is_owner && boat.photos.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={() => setChoosingCover(true)} style={styles.coverButton}>
              <Ionicons name="images-outline" size={16} color="#fff" />
              <Text style={styles.coverButtonText}>{t('photos.changeCover')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Card style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="boat" size={30} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={typography.heading}>{boat.name}</Text>
          {boat.sail_number ? <Text style={styles.sail}>{boat.sail_number}</Text> : null}
          <Text style={typography.caption}>
            {t('boats.owner')}: {boat.owner.name}
          </Text>
        </View>
        {boat.is_owner && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('boats.editTitle')}
            hitSlop={8}
            onPress={() => router.push({ pathname: '/boats/edit', params: { id: String(boat.id) } })}
          >
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </Pressable>
        )}
      </Card>

      <View style={styles.stats}>
        <Stat value={boat.stats.regattas} label={t('profile.statsRegattas')} />
        <Stat value={boat.stats.podiums} label={t('profile.statsPodiums')} />
        <Stat value={boat.stats.wins} label={t('profile.statsWins')} />
      </View>

      {boat.description ? (
        <Card>
          <Text style={typography.body}>{boat.description}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={typography.label}>{t('boats.technical')}</Text>
        {specs
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <View key={label} style={styles.infoRow}>
              {/* La unidad ya va en el valor ("6.93 m"), se saca de la etiqueta. */}
              <Text style={typography.caption}>{label.replace(/ \((m|kg)\)$/, '')}</Text>
              <Text style={[typography.body, { flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
            </View>
          ))}
      </Card>

      {(boat.photos.length > 0 || boat.is_owner) && (
        <Card>
          <View style={styles.cardHeader}>
            <Text style={typography.label}>{t('photos.title')}</Text>
            {boat.is_owner && boat.photos.length > 1 ? (
              <Pressable accessibilityRole="button" onPress={() => setChoosingCover(true)} hitSlop={8}>
                <Text style={styles.link}>{t('photos.changeCover')}</Text>
              </Pressable>
            ) : null}
          </View>
          {boat.photos.length === 0 ? <Text style={typography.caption}>{t('photos.emptyBoat')}</Text> : null}
          <PhotoGallery
            photos={boat.photos}
            editable={boat.is_owner}
            uploading={uploading}
            onAdd={addPhoto}
            onDelete={removePhoto}
            onSetCover={makeCover}
          />
        </Card>
      )}

      <CrewCard boat={boat} onChange={load} />

      <Card>
        <Text style={typography.label}>{t('boats.history')}</Text>
        {boat.history.length === 0 ? (
          <Text style={typography.caption}>{t('boats.noHistory')}</Text>
        ) : (
          boat.history.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/results/[id]', params: { id: String(entry.id) } })}
              style={({ pressed }) => [styles.result, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.position, entry.position <= 3 && styles.podium]}>
                <Text style={[styles.positionText, entry.position <= 3 && { color: '#fff' }]}>{entry.position}º</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.body, { fontWeight: '600' }]} numberOfLines={1}>
                  {entry.event_name}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {[entry.date.slice(0, 4), entry.fleet_size ? t('result.of', { count: entry.fleet_size }) : null, entry.sailor.name]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </Card>

      <CoverPicker visible={choosingCover} photos={boat.photos} onSelect={makeCover} onClose={() => setChoosingCover(false)} />
    </Screen>
  );
}

function CrewCard({ boat, onChange }: { boat: Boat; onChange: () => void }) {
  const { t } = useTranslation();
  const { confirm, notify } = useDialogs();

  async function remove(member: CrewMember) {
    const ok = await confirm({
      title: t('crew.confirmRemove', { name: member.display_name }),
      confirmLabel: t('boats.removeCrew'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeCrew(boat.id, member.id);
      notify(t('crew.removed', { name: member.display_name }));
      onChange();
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    }
  }

  return (
    <Card>
      <Text style={typography.label}>{t('boats.crew')}</Text>
      {boat.crew.length === 0 ? <Text style={typography.caption}>{t('boats.noCrew')}</Text> : null}
      {boat.crew.map((member) => (
        <View key={member.id} style={styles.crewRow}>
          <Avatar uri={member.avatar} initials={member.display_name.slice(0, 2).toUpperCase()} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={typography.body}>{member.display_name}</Text>
            <Text style={typography.caption}>
              {[
                member.role ? t(`sailor.roles.${member.role}`) : null,
                member.user_id ? t('crew.onMsail') : null,
                member.is_active ? null : t('boats.formerCrew'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {boat.is_owner && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('boats.removeCrew')} hitSlop={8} onPress={() => remove(member)}>
              <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      ))}
      {boat.is_owner ? <CrewSearch boat={boat} onAdded={onChange} /> : null}
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

const styles = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: colors.surfaceRaised },
  coverButton: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(5,11,24,0.78)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  coverButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  icon: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sail: { color: colors.primary, fontWeight: '700', letterSpacing: 1 },
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
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
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
  },
  podium: { backgroundColor: colors.primary, borderColor: colors.primary },
  positionText: { color: colors.text, fontWeight: '800', fontSize: 15 },
});
