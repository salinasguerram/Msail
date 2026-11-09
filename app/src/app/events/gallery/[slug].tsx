import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text } from 'react-native';

import { getEventMedia, type EventMedia } from '@/api/events';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EventGallery } from '@/components/EventGallery';
import { Screen } from '@/components/Screen';
import { colors, spacing, typography } from '@/theme';

/** Galería completa de una regata, de a 24 fotos o videos. */
export default function EventGalleryScreen() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Pide una página; el estado solo se toca cuando llega la respuesta.
  const fetchPage = useCallback(
    (next: number) =>
      getEventMedia(slug, next)
        .then((data) => {
          setMedia((current) => (next === 1 ? data.results : [...current, ...data.results]));
          setPage(next);
          setHasMore(!!data.next);
        })
        .catch(setError)
        .finally(() => setLoading(false)),
    [slug],
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  function load(next: number) {
    setLoading(true);
    setError(null);
    fetchPage(next);
  }

  return (
    <Screen>
      {media.length > 0 ? <EventGallery media={media} /> : null}
      {!loading && !error && media.length === 0 ? (
        <Card>
          <Text style={[typography.body, { color: colors.textMuted }]}>{t('gallery.empty')}</Text>
        </Card>
      ) : null}
      {error ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={typography.body}>{errorMessage(error, t)}</Text>
          <Button title={t('profile.retry')} variant="ghost" onPress={() => load(media.length ? page + 1 : 1)} />
        </Card>
      ) : null}
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
      {hasMore && !loading && !error ? <Button title={t('gallery.more')} variant="secondary" onPress={() => load(page + 1)} /> : null}
    </Screen>
  );
}
