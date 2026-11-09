import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ArticleCard } from '@/api/news';
import { colors, radius, spacing, typography } from '@/theme';

const open = (slug: string) => router.push({ pathname: '/news/[slug]', params: { slug } });

/** "Hace 3 h", "Ayer", "5 nov.". */
export function useRelativeDate() {
  const { t, i18n } = useTranslation();
  return (value: string) => {
    const date = new Date(value);
    const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
    if (hours < 1) return t('news.justNow');
    if (hours < 24) return t('news.hoursAgo', { count: hours });
    if (hours < 48) return t('news.yesterday');
    return date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  };
}

/** Portada de la noticia o, si no tiene foto, un fondo con el ícono de la sección. */
export function Cover({ uri, style, iconSize = 32 }: { uri: string | null; style: object; iconSize?: number }) {
  if (uri) return <Image source={{ uri }} style={style} accessibilityIgnoresInvertColors />;
  return (
    <View style={[style, styles.placeholder]}>
      <Ionicons name="newspaper-outline" size={iconSize} color={colors.primary} />
    </View>
  );
}

function Meta({ article }: { article: ArticleCard }) {
  const { t } = useTranslation();
  const when = useRelativeDate();
  return (
    <Text style={typography.caption} numberOfLines={1}>
      {[when(article.published_at), article.country_name, t('news.minutes', { count: article.reading_minutes })]
        .filter(Boolean)
        .join(' · ')}
    </Text>
  );
}

/** Noticia principal, con la foto grande. */
export function LeadStory({ article }: { article: ArticleCard }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => open(article.slug)}
      style={({ pressed }) => [styles.lead, pressed && { opacity: 0.85 }]}
    >
      <Cover uri={article.cover} style={styles.leadImage} iconSize={48} />
      <View style={styles.leadBody}>
        <Text style={styles.kicker}>{t('news.dayCover')}</Text>
        <Text style={styles.leadTitle}>{article.title}</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{article.summary}</Text>
        <Meta article={article} />
      </View>
    </Pressable>
  );
}

/** Tarjeta vertical para el carrusel de la semana. */
export function WeekCard({ article, rank }: { article: ArticleCard; rank: number }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => open(article.slug)}
      style={({ pressed }) => [styles.week, pressed && { opacity: 0.85 }]}
    >
      <Cover uri={article.cover_thumb} style={styles.weekImage} />
      <View style={styles.rank}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
      <View style={{ padding: spacing.md, gap: 4, flex: 1 }}>
        <Text style={[typography.body, { fontWeight: '700' }]} numberOfLines={3}>
          {article.title}
        </Text>
        <Meta article={article} />
      </View>
    </Pressable>
  );
}

/** Fila con miniatura para el listado. */
export function NewsRow({ article }: { article: ArticleCard }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => open(article.slug)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <Cover uri={article.cover_thumb} style={styles.rowImage} iconSize={22} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[typography.body, { fontWeight: '700' }]} numberOfLines={2}>
          {article.title}
        </Text>
        <Text style={typography.caption} numberOfLines={2}>
          {article.summary}
        </Text>
        <Meta article={article} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  lead: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  leadImage: { width: '100%', aspectRatio: 16 / 9 },
  leadBody: { padding: spacing.lg, gap: spacing.sm },
  kicker: { color: colors.live, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  leadTitle: { ...typography.title, fontSize: 24, lineHeight: 30 },
  week: {
    width: 240,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekImage: { width: '100%', height: 130 },
  rank: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { color: '#fff', fontWeight: '800' },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowImage: { width: 96, height: 96, borderRadius: radius.md },
});
