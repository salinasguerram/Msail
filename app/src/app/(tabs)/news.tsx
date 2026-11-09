import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  getArticles,
  getFrontPage,
  getNewsFilterOptions,
  type ArticleCard,
  type FrontPage,
  type NewsFilterOptions,
  type NewsFilters,
} from '@/api/news';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LeadStory, NewsRow, WeekCard } from '@/components/NewsCards';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/SelectField';
import { colors, radius, spacing, typography } from '@/theme';

const SEARCH_DEBOUNCE_MS = 350;
const EMPTY_OPTIONS: NewsFilterOptions = { countries: [], classes: [], events: [] };

/**
 * Sección de noticias. Sin filtros: portada del día, lo destacado de la semana y las últimas.
 * Con filtros (país, clase, campeonato o búsqueda): el listado de las que coinciden.
 * Acepta ?event=<slug> para abrirse filtrada por una regata (desde su página).
 */
export default function NewsScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ event?: string }>();
  const [filters, setFilters] = useState<NewsFilters>({ event: params.event ?? null });
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<NewsFilterOptions>(EMPTY_OPTIONS);
  const filtered = Boolean(filters.country || filters.boatClass || filters.event || filters.q);

  // Si se vuelve a entrar desde otra regata, se aplica su filtro.
  const [lastParam, setLastParam] = useState(params.event);
  if (params.event !== lastParam) {
    setLastParam(params.event);
    if (params.event) setFilters({ event: params.event });
  }

  useEffect(() => {
    getNewsFilterOptions().then(setOptions).catch(() => {});
  }, []);

  // Busca mientras se escribe, esperando a que haya una pausa.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => ((f.q ?? '') === search.trim() ? f : { ...f, q: search.trim() || null }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const set = (patch: Partial<NewsFilters>) => setFilters((f) => ({ ...f, ...patch }));
  function clear() {
    setSearch('');
    setFilters({});
    if (params.event) router.setParams({ event: undefined });
  }

  return (
    <Screen>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('news.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          accessibilityLabel={t('news.search')}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => set({ q: search.trim() || null })}
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.clearSearch')} hitSlop={10} onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filters}>
        <View style={styles.filter}>
          <SelectField
            label={t('calendar.country')}
            value={filters.country ?? null}
            placeholder={t('calendar.anyCountry')}
            options={options.countries}
            onChange={(v) => set({ country: v })}
          />
        </View>
        <View style={styles.filter}>
          <SelectField
            label={t('calendar.boatClass')}
            value={filters.boatClass ?? null}
            placeholder={t('calendar.anyClass')}
            options={options.classes}
            onChange={(v) => set({ boatClass: v })}
          />
        </View>
        <View style={styles.filter}>
          <SelectField
            label={t('news.championship')}
            value={filters.event ?? null}
            placeholder={t('news.anyChampionship')}
            // Si se llegó desde una regata que no está en la lista (aún), se muestra igual su filtro.
            options={
              filters.event && !options.events.some((o) => o.value === filters.event)
                ? [{ value: filters.event, label: filters.event }, ...options.events]
                : options.events
            }
            onChange={(v) => set({ event: v })}
          />
        </View>
      </View>

      {filtered ? <FilteredList key={JSON.stringify(filters)} filters={filters} onClear={clear} /> : <Front />}
    </Screen>
  );
}

/** Portada de la sección. */
function Front() {
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
    return error ? (
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
      <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
    );
  }

  if (!front.day) {
    return (
      <Card style={{ alignItems: 'center' }}>
        <Text style={[typography.body, { textAlign: 'center' }]}>{t('news.empty')}</Text>
      </Card>
    );
  }

  const latest = [...front.latest, ...more];
  return (
    <>
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
    </>
  );
}

/** Noticias que coinciden con los filtros. */
function FilteredList({ filters, onClear }: { filters: NewsFilters; onClear: () => void }) {
  const { t } = useTranslation();
  const [articles, setArticles] = useState<ArticleCard[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // El estado se toca solo cuando llega la respuesta (o en el botón "Cargar más").
  const fetchPage = useCallback(
    (next: number) =>
      getArticles(next, filters)
        .then((data) => {
          setArticles((list) => (next === 1 ? data.results : [...list, ...data.results]));
          setCount(data.count);
          setPage(next);
          setHasMore(!!data.next);
          setError(null);
        })
        .catch(setError)
        .finally(() => setLoading(false)),
    [filters],
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  return (
    <>
      <View style={styles.summary}>
        <Text style={typography.caption}>{t('news.found', { count })}</Text>
        <Pressable accessibilityRole="button" onPress={onClear} hitSlop={8}>
          <Text style={styles.link}>{t('calendar.clearFilters')}</Text>
        </Pressable>
      </View>

      {!loading && !error && articles.length === 0 ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[typography.body, { textAlign: 'center' }]}>
            {filters.q ? t('news.noSearchResults', { q: filters.q }) : t('news.noFilterResults')}
          </Text>
        </Card>
      ) : null}

      <View>
        {articles.map((article) => (
          <NewsRow key={article.id} article={article} />
        ))}
      </View>

      {error ? <Text style={{ color: colors.danger }}>{errorMessage(error, t)}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
      {hasMore && !loading ? (
        <Button
          title={t('gallery.more')}
          variant="secondary"
          onPress={() => {
            setLoading(true);
            fetchPage(page + 1);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.heading, fontSize: 18 },
  carousel: { gap: spacing.md, paddingRight: spacing.lg },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: spacing.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  filter: { flexBasis: '30%', flexGrow: 1, minWidth: 150 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
