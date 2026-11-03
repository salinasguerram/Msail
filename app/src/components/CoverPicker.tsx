import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Photo } from '@/api/photos';
import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  visible: boolean;
  photos: Photo[];
  onSelect: (photo: Photo) => void;
  onClose: () => void;
};

/** Grilla para elegir cuál de las fotos subidas es la portada de la embarcación. */
export function CoverPicker({ visible, photos, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop}>
        <View style={styles.panel}>
          <Text style={typography.heading}>{t('photos.chooseCover')}</Text>
          <Text style={typography.caption}>{t('photos.chooseCoverHint')}</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {photos.map((photo) => (
              <Pressable
                key={photo.id}
                accessibilityRole="button"
                accessibilityState={{ selected: !!photo.is_cover }}
                accessibilityLabel={photo.caption || t('photos.open')}
                onPress={() => onSelect(photo)}
                style={[styles.cell, photo.is_cover && styles.current]}
              >
                <Image source={{ uri: photo.image }} style={styles.thumb} />
                {photo.is_cover ? (
                  <View style={styles.badge}>
                    <Ionicons name="star" size={12} color="#fff" />
                    <Text style={styles.badgeText}>{t('photos.currentCover')}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
          <Button title={t('common.cancel')} variant="ghost" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3,7,18,0.72)', justifyContent: 'center', padding: spacing.lg },
  panel: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: '48%', aspectRatio: 4 / 3, borderRadius: radius.md, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  current: { borderColor: colors.primary },
  thumb: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
