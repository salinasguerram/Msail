import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getArticles, getFrontPage, type ArticleCard, type FrontPage } from '@/api/news';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LeadStory, NewsRow, WeekCard } from '@/components/NewsCards';
import { Screen } from '@/components/Screen';
import { colors, spacing, typography } from '@/theme';

/** Sección de noticias: portada del día, lo destacado de la semana y las últimas. */
export default function NewsScreen() {
  const { t } = useTranslation();
  const [front, setFront] = useState<FrontPage | null>(null);
  const [more, setMore] = useState<ArticleCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // La portada trae las primeras 10 últimas; el resto se pide del listado completo.
  const fetchFront = useCallback(
    () =>
      getFrontPage()
        .then((data) => {
          setFront(data);
          setMore([]);
          setPage(1);
          setHasMore(data.latest.length >= 10);
        })
        .catch(setError),
    [],
  );

  useEffect(() => {
    fetchFront();
  }, [fetchFront]);

  async function loadMore() {
    if (!front) return;
    setLoadingMore(true);
    try {
      // El listado completo incluye las de arriba: se saltean las que ya se ven.
      const shown = new Set([front.day?.id, ...front.week.map((a) => a.id), ...front.latest.map((a) => a.id), ...more.map((a) => a.id)]);
      const data = await getArticles(page + 1);
      setMore((list) => [...list, ...data.results.filter((a) => !shown.has(a.id))]);
      setPage(page + 1);
      setHasMore(!!data.next);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  }

  if (!front) {
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={typography.body}>{errorMessage(error, t)}</Text>
            <Button
              title={t('profile.retry')}
              variant="ghost"
              onPress={() => {
                setError(null);
                fetchFront();
              }}
            />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        )}
      </Screen>
    );
  }

  if (!front.day) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center' }}>
          <Text style={[typography.body, { textAlign: 'center' }]}>{t('news.empty')}</Text>
        </Card>
      </Screen>
    );
  }

  const latest = [...front.latest, ...more];
  return (
    <Screen>
      <LeadStory article={front.day} />

      {front.week.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.heading}>{t('news.week')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
            {front.week.map((article, index) => (
              <WeekCard key={article.id} article={article} rank={index + 1} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {latest.length > 0 ? (
        <View>
          <Text style={[styles.heading, { marginBottom: spacing.xs }]}>{t('news.latest')}</Text>
          {latest.map((article) => (
            <NewsRow key={article.id} article={article} />
          ))}
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{errorMessage(error, t)}</Text> : null}
      {hasMore ? <Button title={t('gallery.more')} variant="secondary" loading={loadingMore} onPress={loadMore} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.heading, fontSize: 18 },
  carousel: { gap: spacing.md, paddingRight: spacing.lg },
});
