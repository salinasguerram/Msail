import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getEvents } from '@/api/events';
import { getFrontPage, type ArticleCard } from '@/api/news';
import { colors, fonts, radius, spacing } from '@/theme';
import { BrandCover } from '@/components/BrandCover';

/** Una tarjeta de "Hoy en la vela": un campeonato en curso o una noticia. */
export type FeedItem = {
  key: string;
  kind: 'live' | 'news';
  title: string;
  /** Lugar o resumen corto. */
  subtitle: string;
  image: string | null;
  /** Para las noticias, cuándo se publicó. */
  publishedAt: string | null;
  href: Href;
  /** Campeonato relacionado: con él se puede ver el lugar en el planeta. */
  eventSlug: string | null;
  /** Clases de embarcación (para la portada cuando no hay foto). */
  classes: string[];
};

const MAX_ITEMS = 8;
const REFRESH_MS = 10 * 60 * 1000;

/** Lo que está pasando: primero los campeonatos en curso, después la noticia del día y las de la semana. */
export function useTodayFeed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      Promise.all([getEvents({ when: 'live' }).catch(() => null), getFrontPage().catch(() => null)]).then(([live, front]) => {
        if (!active) return;
        const feed: FeedItem[] = (live?.results ?? []).map((event) => ({
          key: `event:${event.slug}`,
          kind: 'live',
          title: event.name,
          subtitle: [event.venue || event.city, event.country_name].filter(Boolean).join(' · '),
          image: null,
          publishedAt: null,
          classes: event.boat_classes,
          href: { pathname: '/events/[slug]', params: { slug: event.slug } },
          eventSlug: event.slug,
        }));
        const seen = new Set<number>();
        const articles = [front?.day, ...(front?.week ?? []), ...(front?.latest ?? [])].filter((a): a is ArticleCard => {
          if (!a || seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
        articles.sort((a, b) => b.published_at.localeCompare(a.published_at));
        for (const article of articles) {
          feed.push({
            key: `news:${article.id}`,
            kind: 'news',
            title: article.title,
            subtitle: article.event?.name ?? article.country_name ?? '',
            image: article.cover_thumb ?? article.cover,
            publishedAt: article.published_at,
            classes: article.boat_classes,
            href: { pathname: '/news/[slug]', params: { slug: article.slug } },
            eventSlug: article.event?.slug ?? null,
          });
        }
        setItems(feed.slice(0, MAX_ITEMS));
      });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return items;
}

/** "Hace 2 h", "ayer", "hace 3 días" en el idioma de la app. */
function timeAgo(iso: string, language: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  if (minutes < 60) return format.format(-Math.max(1, minutes), 'minute');
  if (minutes < 60 * 24) return format.format(-Math.round(minutes / 60), 'hour');
  return format.format(-Math.round(minutes / (60 * 24)), 'day');
}

type Props = {
  items: FeedItem[];
  /** Mostrar en el planeta el lugar del campeonato. */
  onLocate: (eventSlug: string) => void;
  /** Si el campeonato está en el planeta (si no, la tarjeta no muestra el botón de ubicarlo). */
  canLocate: (eventSlug: string) => boolean;
  /** Tira horizontal (celular) o columna (web ancha). */
  layout: 'strip' | 'column';
};

/** "Hoy en la vela": las noticias y los campeonatos de hoy, alrededor del planeta. */
export function TodayFeed({ items, onLocate, canLocate, layout }: Props) {
  const { t } = useTranslation();
  const cards = items.map((item) => (
    <FeedCard key={item.key} item={item} onLocate={item.eventSlug && canLocate(item.eventSlug) ? onLocate : null} layout={layout} />
  ));
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={styles.pulse} />
          <Text style={styles.label}>{t('explore.today')}</Text>
        </View>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/news')}>
          <Text style={styles.seeAll}>{t('explore.seeAllNews')}</Text>
        </Pressable>
      </View>
      {layout === 'strip' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {cards}
        </ScrollView>
      ) : (
        <View style={{ gap: spacing.md }}>{cards}</View>
      )}
    </View>
  );
}

const ROTATE_MS = 6000;

/**
 * "Noticias de vela" (celular, como el boceto de Miguel): una tarjeta con foto que va pasando sola por lo que está
 * pasando hoy (campeonatos en vivo y noticias). Al tocarla abre esa noticia; la flecha abre todas.
 */
export function NewsCard({ items }: { items: FeedItem[] }) {
  const { t, i18n } = useTranslation();
  const [index, setIndex] = useState(0);
  const count = Math.min(items.length, 5);
  useEffect(() => {
    if (count < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [count]);
  const item = items[index % Math.max(count, 1)];
  if (!item) return null;
  const tag = item.kind === 'live' ? t('explore.live') : item.publishedAt ? timeAgo(item.publishedAt, i18n.language) : '';
  return (
    <View style={styles.newsCard}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t('explore.sailingNews')}. ${item.title}`}
        onPress={() => router.push(item.href)}
        style={({ pressed }) => [styles.newsMain, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.newsImage}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <BrandCover compact style={StyleSheet.absoluteFill} />
          )}
        </View>
        <View style={styles.newsDivider} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={styles.newsHeader}>
            <Text style={styles.newsTitle}>{t('explore.sailingNews')}</Text>
            <Text style={[styles.tag, item.kind === 'live' && styles.live]} numberOfLines={1}>
              {tag}
            </Text>
          </View>
          <Text style={styles.newsText} numberOfLines={2}>
            {item.title}
          </Text>
          {count > 1 ? (
            <View style={styles.dots}>
              {Array.from({ length: count }, (_, i) => (
                <View key={i} style={[styles.dot, i === index % count && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('explore.seeAllNews')}
        hitSlop={8}
        onPress={() => router.push('/news')}
        style={styles.newsMore}
      >
        <Ionicons name="chevron-forward" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

function FeedCard({ item, onLocate, layout }: { item: FeedItem; onLocate: ((slug: string) => void) | null; layout: 'strip' | 'column' }) {
  const { t, i18n } = useTranslation();
  const column = layout === 'column';
  const tag = item.kind === 'live' ? t('explore.live') : item.publishedAt ? timeAgo(item.publishedAt, i18n.language) : '';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${tag}. ${item.title}`}
      onPress={() => router.push(item.href)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.card,
        column ? styles.cardColumn : styles.cardStrip,
        (pressed || hovered) && { borderColor: colors.primary },
      ]}
    >
      <View style={column ? styles.imageColumn : styles.imageStrip}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <BrandCover
            compact={!column}
            title={item.kind === 'live' ? item.title : item.subtitle}
            classes={item.classes}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
      <View style={[styles.body, column && { padding: spacing.md }]}>
        <View style={styles.meta}>
          <Text style={[styles.tag, item.kind === 'live' && styles.live]} numberOfLines={1}>
            {tag}
          </Text>
          {item.eventSlug && onLocate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('explore.onPlanet')}
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation?.();
                onLocate(item.eventSlug!);
              }}
              style={styles.locate}
            >
              <Ionicons name="locate-outline" size={15} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={column ? 3 : 2}>
          {item.title}
        </Text>
        {column && item.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  newsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(11,23,48,0.88)',
    overflow: 'hidden',
  },
  newsMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm },
  newsImage: {
    width: 96,
    height: 64,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  newsDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  newsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  newsTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 15 },
  newsText: { color: colors.textMuted, fontSize: 13, lineHeight: 17 },
  newsMore: { paddingHorizontal: spacing.md, alignSelf: 'stretch', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 4, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  label: { color: colors.text, fontFamily: fonts.heading, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  seeAll: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(11,23,48,0.9)',
    overflow: 'hidden',
  },
  cardStrip: { width: 250, height: 76 },
  cardColumn: { flexDirection: 'column', gap: 0 },
  imageStrip: { width: 76, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  imageColumn: { height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  body: { flex: 1, paddingVertical: spacing.sm, paddingRight: spacing.sm, paddingLeft: 2, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  tag: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', flexShrink: 1 },
  live: { color: colors.live },
  locate: { padding: 2 },
  title: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 12 },
});
