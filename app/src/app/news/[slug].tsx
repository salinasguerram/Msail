import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { getArticle, type ArticleDetail } from '@/api/news';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Cover, NewsRow } from '@/components/NewsCards';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';
import { goBack } from '@/utils/navigation';

export default function ArticleScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const classes = useBoatClasses();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fetchArticle = useCallback(() => getArticle(slug).then(setArticle).catch(setError), [slug]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  useLayoutEffect(() => {
    if (article) navigation.setOptions({ title: article.title });
  }, [navigation, article]);

  if (!article) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={typography.body}>{notFound ? t('news.notFound') : errorMessage(error, t)}</Text>
            <Button
              title={notFound ? t('news.backToNews') : t('profile.retry')}
              variant="ghost"
              onPress={
                notFound
                  ? () => goBack('/news')
                  : () => {
                      setError(null);
                      fetchArticle();
                    }
              }
            />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        )}
      </Screen>
    );
  }

  const date = new Date(article.published_at).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const tags = [article.country_name, ...article.boat_classes.map((slug) => className(classes, slug))].filter(Boolean);

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Cover uri={article.cover} style={styles.cover} iconSize={48} />
        {article.cover_credit ? <Text style={[typography.caption, { textAlign: 'right' }]}>{article.cover_credit}</Text> : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.title} role="heading">
          {article.title}
        </Text>
        <Text style={styles.summary}>{article.summary}</Text>
        <Text style={typography.caption}>
          {[article.author, date.charAt(0).toUpperCase() + date.slice(1), t('news.minutes', { count: article.reading_minutes })]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {tags.length ? (
          <View style={styles.tags}>
            {tags.map((tag) => (
              <Text key={tag} style={styles.tag}>
                {tag}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: spacing.md }}>
        {article.blocks.map((block, index) =>
          block.type === 'heading' ? (
            <Text key={index} style={styles.subheading} role="heading">
              {block.text}
            </Text>
          ) : block.type === 'quote' ? (
            <Text key={index} style={styles.quote}>
              {block.text}
            </Text>
          ) : (
            <Text key={index} style={styles.paragraph}>
              {block.text}
            </Text>
          ),
        )}
      </View>

      {article.source_url ? (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(article.source_url)} style={styles.source} hitSlop={6}>
          <Ionicons name="open-outline" size={16} color={colors.primary} />
          <Text style={styles.sourceText}>{t('news.source', { name: article.source_name })}</Text>
        </Pressable>
      ) : null}

      {article.event ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/events/[slug]', params: { slug: article.event!.slug } })}
          style={({ pressed }) => [styles.event, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="trophy-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={typography.caption}>{t('news.relatedEvent')}</Text>
            <Text style={[typography.body, { fontWeight: '700' }]}>{article.event.name}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {article.related.length ? (
        <View>
          <Text style={[typography.heading, { fontSize: 18, marginBottom: spacing.xs }]}>{t('news.related')}</Text>
          {article.related.map((related) => (
            <NewsRow key={related.id} article={related} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg },
  title: { ...typography.title, fontSize: 26, lineHeight: 32 },
  summary: { color: colors.text, fontSize: 17, lineHeight: 25, fontWeight: '500' },
  paragraph: { color: colors.text, fontSize: 16, lineHeight: 25 },
  subheading: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: spacing.xs },
  quote: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 26,
    fontStyle: 'italic',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.md,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  source: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  sourceText: { color: colors.primary, fontWeight: '600' },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
