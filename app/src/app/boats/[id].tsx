import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { addCrew, formatMeters, getBoat, removeCrew, type Boat } from '@/api/boats';
import { deleteBoatPhoto, pickImage, setBoatCover, uploadBoatPhoto } from '@/api/photos';
import { SAILING_ROLES, type SailingRole } from '@/api/profiles';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { errorMessage, fieldError } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { confirmAction } from '@/components/FormSection';
import { PhotoGallery } from '@/components/PhotoGallery';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing, typography } from '@/theme';

export default function BoatDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const classes = useBoatClasses();
  const [boat, setBoat] = useState<Boat | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function addPhoto() {
    if (!boat) return;
    setPhotoError(null);
    const asset = await pickImage();
    if (!asset) return;
    setUploading(true);
    try {
      await uploadBoatPhoto(boat.id, asset);
      load();
    } catch (e) {
      setPhotoError(errorMessage(e, t));
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(photoId: number) {
    if (!boat || !(await confirmAction(t('photos.confirmDelete'), t('photos.delete'), t('common.cancel')))) return;
    await deleteBoatPhoto(boat.id, photoId);
    load();
  }

  const load = useCallback(() => {
    setError(null);
    getBoat(Number(id)).then(setBoat).catch(setError);
  }, [id]);

  useFocusEffect(load);

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
      {boat.cover ? <Image source={{ uri: boat.cover }} style={styles.hero} accessibilityLabel={boat.name} /> : null}
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
          <Text style={typography.label}>{t('photos.title')}</Text>
          {boat.photos.length === 0 ? <Text style={typography.caption}>{t('photos.emptyBoat')}</Text> : null}
          <PhotoGallery
            photos={boat.photos}
            editable={boat.is_owner}
            uploading={uploading}
            onAdd={addPhoto}
            onDelete={(photo) => removePhoto(photo.id)}
            onSetCover={async (photo) => {
              await setBoatCover(boat.id, photo.id);
              load();
            }}
          />
          {photoError ? <Text style={{ color: colors.danger }}>{photoError}</Text> : null}
        </Card>
      )}

      <CrewCard boat={boat} onChange={load} />

      <Card>
        <Text style={typography.label}>{t('boats.history')}</Text>
        {boat.history.length === 0 ? (
          <Text style={typography.caption}>{t('boats.noHistory')}</Text>
        ) : (
          boat.history.map((entry) => (
            <View key={entry.id} style={styles.result}>
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
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

function CrewCard({ boat, onChange }: { boat: Boat; onChange: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [role, setRole] = useState<SailingRole | ''>('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await addCrew(boat.id, { name: name.trim(), role });
      setName('');
      setRole('');
      onChange();
    } catch (e) {
      setError(e);
    } finally {
      setAdding(false);
    }
  }

  async function remove(memberId: number) {
    if (!(await confirmAction(t('boats.removeCrew'), t('boats.removeCrew'), t('common.cancel')))) return;
    await removeCrew(boat.id, memberId).catch(setError);
    onChange();
  }

  return (
    <Card>
      <Text style={typography.label}>{t('boats.crew')}</Text>
      {boat.crew.length === 0 ? <Text style={typography.caption}>{t('boats.noCrew')}</Text> : null}
      {boat.crew.map((member) => (
        <View key={member.id} style={styles.crewRow}>
          <Ionicons name="person-circle-outline" size={28} color={member.is_active ? colors.primary : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={typography.body}>{member.display_name}</Text>
            <Text style={typography.caption}>
              {[member.role ? t(`sailor.roles.${member.role}`) : null, member.is_active ? null : t('boats.formerCrew')]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {boat.is_owner && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('boats.removeCrew')} hitSlop={8} onPress={() => remove(member.id)}>
              <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      ))}

      {boat.is_owner && (
        <View style={styles.addCrew}>
          <TextField
            label={t('boats.crewName')}
            value={name}
            onChangeText={setName}
            error={fieldError(error, 'name')}
            onSubmitEditing={add}
          />
          <ChipGroup>
            {SAILING_ROLES.map((r) => (
              <Chip key={r} label={t(`sailor.roles.${r}`)} selected={role === r} onPress={() => setRole(role === r ? '' : r)} />
            ))}
          </ChipGroup>
          <Button title={t('boats.addCrew')} variant="secondary" onPress={add} loading={adding} disabled={!name.trim()} />
        </View>
      )}
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  addCrew: { gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
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
