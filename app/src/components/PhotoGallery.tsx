import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Photo } from '@/api/photos';
import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  photos: Photo[];
  editable?: boolean;
  uploading?: boolean;
  onAdd?: () => void;
  onDelete?: (photo: Photo) => Promise<void> | void;
  onSetCover?: (photo: Photo) => Promise<void> | void;
};

/** Grilla de fotos de 3 columnas. Tocar una la abre en grande. */
export function PhotoGallery({ photos, editable = false, uploading = false, onAdd, onDelete, onSetCover }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action?: (photo: Photo) => Promise<void> | void) {
    if (!open || !action) return;
    const photo = open;
    setOpen(null);
    setBusy(true);
    try {
      await action(photo);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.grid}>
      {photos.map((photo) => (
        <Pressable
          key={photo.id}
          accessibilityRole="imagebutton"
          accessibilityLabel={photo.caption || t('photos.open')}
          onPress={() => setOpen(photo)}
          style={styles.cell}
        >
          <Image source={{ uri: photo.image }} style={styles.thumb} />
          {photo.is_cover ? (
            <View style={styles.coverBadge}>
              <Ionicons name="star" size={12} color="#fff" />
            </View>
          ) : null}
        </Pressable>
      ))}
      {editable && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('photos.add')}
          onPress={onAdd}
          disabled={uploading}
          style={[styles.cell, styles.add]}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="add" size={28} color={colors.primary} />
              <Text style={styles.addText}>{t('photos.add')}</Text>
            </>
          )}
        </Pressable>
      )}

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <SafeAreaView style={styles.viewer}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setOpen(null)} style={styles.close} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {open ? <Image source={{ uri: open.image }} style={styles.full} resizeMode="contain" /> : null}
          {open?.caption ? <Text style={[typography.body, styles.caption]}>{open.caption}</Text> : null}
          {editable && open ? (
            <View style={styles.actions}>
              {onSetCover && !open.is_cover ? (
                <Button title={t('photos.setCover')} variant="secondary" loading={busy} onPress={() => run(onSetCover)} />
              ) : null}
              {onDelete ? <Button title={t('photos.delete')} variant="ghost" disabled={busy} onPress={() => run(onDelete)} /> : null}
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  thumb: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    padding: 4,
  },
  add: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  viewer: { flex: 1, backgroundColor: 'rgba(3,7,18,0.96)', padding: spacing.lg, gap: spacing.md },
  close: { alignSelf: 'flex-end' },
  full: { flex: 1, width: '100%' },
  caption: { textAlign: 'center' },
  actions: { gap: spacing.sm, width: '100%', maxWidth: 420, alignSelf: 'center' },
});
