import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { EventMedia } from '@/api/events';
import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';

/** Grilla de 3 columnas con las fotos y videos de una regata. Tocar uno lo abre en grande. */
export function EventGallery({ media }: { media: EventMedia[] }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState<number | null>(null);

  return (
    <View style={styles.grid}>
      {media.map((item, i) => (
        <Pressable
          key={item.id}
          accessibilityRole="imagebutton"
          accessibilityLabel={item.caption || t(item.kind === 'video' ? 'gallery.openVideo' : 'gallery.openPhoto')}
          onPress={() => setIndex(i)}
          style={({ pressed }) => [styles.cell, pressed && { opacity: 0.8 }]}
        >
          {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={styles.thumb} /> : null}
          {item.kind === 'video' ? (
            <View style={styles.play}>
              <Ionicons name="play" size={18} color="#fff" />
            </View>
          ) : null}
        </Pressable>
      ))}
      <MediaViewer media={media} index={index} onChange={setIndex} />
    </View>
  );
}

function MediaViewer({ media, index, onChange }: { media: EventMedia[]; index: number | null; onChange: (i: number | null) => void }) {
  const { t } = useTranslation();
  const item = index !== null ? media[index] : null;
  const close = () => onChange(null);
  const go = (step: number) => index !== null && onChange((index + step + media.length) % media.length);

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={close}>
      <SafeAreaView style={styles.viewer}>
        <View style={styles.top}>
          <Text style={styles.counter}>{index !== null ? `${index + 1} / ${media.length}` : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={close} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.stage}>
          {item?.kind === 'video' ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('gallery.watch')}
              onPress={() => item.video && Linking.openURL(item.video.url)}
              style={styles.videoStage}
            >
              {item.image || item.thumbnail ? (
                <Image source={{ uri: (item.image ?? item.thumbnail)! }} style={styles.full} resizeMode="contain" />
              ) : null}
              <View style={styles.bigPlay}>
                <Ionicons name="play" size={36} color="#fff" />
              </View>
            </Pressable>
          ) : item?.image ? (
            <Image source={{ uri: item.image }} style={styles.full} resizeMode="contain" accessibilityLabel={item.caption} />
          ) : null}

          {media.length > 1 ? (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel={t('gallery.previous')} onPress={() => go(-1)} style={[styles.arrow, { left: 0 }]}>
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('gallery.next')} onPress={() => go(1)} style={[styles.arrow, { right: 0 }]}>
                <Ionicons name="chevron-forward" size={28} color="#fff" />
              </Pressable>
            </>
          ) : null}
        </View>

        {item?.caption ? <Text style={[typography.body, styles.centered]}>{item.caption}</Text> : null}
        {item?.credit ? <Text style={[typography.caption, styles.centered]}>{item.credit}</Text> : null}
        {item?.kind === 'video' && item.video ? (
          <View style={styles.actions}>
            <Button
              title={t(item.video.provider === 'youtube' ? 'gallery.watchYoutube' : 'gallery.watchVimeo')}
              onPress={() => Linking.openURL(item.video!.url)}
            />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  play: { backgroundColor: 'rgba(3,7,18,0.7)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(3,7,18,0.96)', padding: spacing.lg, gap: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { color: colors.textMuted, fontWeight: '600' },
  stage: { flex: 1, justifyContent: 'center' },
  videoStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  full: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bigPlay: { backgroundColor: colors.primary, borderRadius: 36, width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(3,7,18,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { textAlign: 'center' },
  actions: { width: '100%', maxWidth: 420, alignSelf: 'center' },
});
