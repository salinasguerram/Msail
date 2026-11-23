import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getVideo, type MsailingVideoDetail } from '@/api/msailing';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PremiumBadge, PremiumLock } from '@/components/Premium';
import { Screen } from '@/components/Screen';
import { colors, fonts, radius, spacing, typography } from '@/theme';

/** Un video, tip o lección de MSailing. Si es Premium y el usuario no lo es, se ve la presentación con un candado. */
export default function LessonScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const classes = useBoatClasses();
  const [video, setVideo] = useState<MsailingVideoDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fetchVideo = useCallback(() => getVideo(id).then(setVideo).catch(setError), [id]);
  useEffect(() => {
    fetchVideo();
  }, [fetchVideo]);

  if (!video) {
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={[typography.body, { textAlign: 'center' }]}>{errorMessage(error, t)}</Text>
            <Button
              title={t('profile.retry')}
              variant="ghost"
              onPress={() => {
                setError(null);
                fetchVideo();
              }}
            />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        )}
      </Screen>
    );
  }

  const tags = [
    t(`msailing.kinds.${video.kind}`),
    video.level !== 'all' ? t(`msailing.levels.${video.level}`) : null,
    video.boat_classes.length ? video.boat_classes.map((slug) => className(classes, slug)).join(', ') : t('msailing.allClasses'),
  ].filter(Boolean);

  return (
    <Screen>
      {video.thumbnail || video.url ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('msailing.watch')}
          disabled={video.locked || !video.url}
          onPress={() => Linking.openURL(video.url)}
          style={styles.cover}
        >
          {video.thumbnail ? <Image source={{ uri: video.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.coverShade} />
          <View style={styles.playCircle}>
            <Ionicons name={video.locked ? 'lock-closed' : 'play'} size={28} color="#fff" />
          </View>
        </Pressable>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {video.is_premium ? <PremiumBadge locked={video.locked} /> : null}
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.tags}>{tags.join(' · ')}</Text>
        {video.description ? <Text style={[typography.body, { color: colors.textMuted }]}>{video.description}</Text> : null}
      </View>

      {video.locked ? (
        <PremiumLock preview={video.description || video.title} />
      ) : (
        <>
          {video.url ? <Button title={t('msailing.watch')} onPress={() => Linking.openURL(video.url)} /> : null}
          {video.body ? (
            <Card style={{ gap: spacing.md }}>
              {video.body
                .split(/\n\s*\n/)
                .filter((p) => p.trim())
                .map((paragraph, i) => (
                  <Text key={i} style={typography.body}>
                    {paragraph.trim()}
                  </Text>
                ))}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,11,24,0.35)' },
  playCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(47,140,255,0.9)',
  },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 24 },
  tags: { color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
});
