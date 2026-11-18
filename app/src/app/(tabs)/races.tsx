import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { getCountries, searchClubs, type Club, type Country } from '@/api/catalogs';
import { EVENT_TYPES, getEvents, type EventFilters, type EventSummary, type EventType, type EventWhen } from '@/api/events';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/SelectField';
import { colors, fonts, radius, spacing, typography } from '@/theme';
import { setPlanetFocus } from '@/components/explore/planetFocus';
import { RegattaArt } from '@/components/HomeCards';

// Las pasadas van en la pestaña Resultados.
const WHEN: EventWhen[] = ['upcoming', 'live', 'following'];
type Section = 'regattas' | 'trackdays' | 'results';
const SECTIONS: Section[] = ['regattas', 'trackdays', 'results'];
const SEARCH_DEBOUNCE_MS = 350;

// Sin filtros, el mensaje vacío depende de la pestaña (ej. "No hay regatas en curso en este momento").
const EMPTY_MESSAGE = {
  upcoming: 'calendar.emptyUpcoming',
  live: 'calendar.emptyLive',
  past: 'calendar.emptyPast',
  following: 'calendar.emptyFollowing',
} as const;

/** 'AAAA-MM' de los próximos 12 meses (o de los últimos 12, para las pasadas). */
function monthOptions(when: EventWhen, language: string) {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const offset = when === 'past' ? -i : i;
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(language, { month: 'long', year: 'numeric' });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export default function RacesScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const classes = useBoatClasses();
  const [filters, setFilters] = useState<EventFilters>({ when: 'upcoming' });
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [count, setCount] = useState(0);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [section, setSection] = useState<Section>('regattas');
  const [showFilters, setShowFilters] = useState(false);
  const { height } = useWindowDimensions();

  // El planeta (detrás) se acerca a la primera regata de la lista, con sus pines alrededor.
  const focusEvent = events.find((e) => e.latitude && e.longitude);
  const focusLat = focusEvent ? Number(focusEvent.latitude) : null;
  const focusLng = focusEvent ? Number(focusEvent.longitude) : null;
  useEffect(() => {
    if (focusLat === null || focusLng === null) return;
    setPlanetFocus('/races', { lat: focusLat, lng: focusLng, altitude: 0.45, raise: 0.3 });
  }, [focusLat, focusLng]);
  useEffect(() => () => setPlanetFocus('/races', null), []);

  const chooseSection = (next: Section) => {
    setSection(next);
    if (next === 'results') setFilters((f) => ({ ...f, when: 'past', month: null }));
    else if (next === 'regattas') setFilters((f) => ({ ...f, when: f.when === 'past' ? 'upcoming' : f.when, month: null }));
  };

  useEffect(() => {
    getCountries()
      .then(setCountries)
      .catch(() => {});
  }, [i18n.language]);

  // Busca mientras se escribe, esperando a que haya una pausa.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => ((f.q ?? '') === search.trim() ? f : { ...f, q: search.trim() || null }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Los clubes se filtran por el país elegido (si hay uno).
  useEffect(() => {
    searchClubs({ country: filters.country ?? null })
      .then(setClubs)
      .catch(() => setClubs([]));
  }, [filters.country]);

  // "Siguiendo" necesita sesión: sin ella se muestra la invitación a entrar.
  const needsLogin = filters.when === 'following' && !user;

  useEffect(() => {
    if (needsLogin) return;
    let active = true;
    setLoading(true);
    setError(null);
    getEvents(filters)
      .then((page) => {
        if (!active) return;
        setEvents(page.results);
        setCount(page.count);
        setNextPage(page.next ? 2 : null);
      })
      .catch((e) => active && setError(e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [filters, needsLogin]);

  async function loadMore() {
    if (!nextPage) return;
    setLoadingMore(true);
    try {
      const page = await getEvents(filters, nextPage);
      setEvents((current) => [...current, ...page.results]);
      setNextPage(page.next ? nextPage + 1 : null);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  }

  const set = (patch: Partial<EventFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = Boolean(filters.q || filters.type || filters.country || filters.club || filters.boatClass || filters.month);
  const months = useMemo(() => monthOptions(filters.when, i18n.language), [filters.when, i18n.language]);

  const [hero, ...rest] = events;
  const showList = section !== 'trackdays';

  return (
    <Screen>
      {/* Hueco para ver el planeta (detrás) acercado a las regatas. */}
      <View style={{ height: Math.round(height * 0.2) }} pointerEvents="none" />
      <View style={styles.heading}>
        <View style={styles.headingLine} />
        <Text style={styles.headingText}>{t('tabs.events')}</Text>
        <View style={styles.headingLine} />
      </View>

      <View style={styles.sections} role="tablist">
        {SECTIONS.map((key) => {
          const selected = section === key;
          return (
            <Pressable
              key={key}
              role="tab"
              aria-selected={selected}
              onPress={() => chooseSection(key)}
              style={[styles.sectionItem, selected && styles.segmentSelected]}
            >
              <Text style={[styles.sectionText, selected && { color: '#fff' }]}>{t(`calendar.sections.${key}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {section === 'trackdays' ? (
        <Card style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="flag-outline" size={30} color={colors.primary} />
          <Text style={[typography.heading, { textAlign: 'center' }]}>{t('calendar.trackdaysTitle')}</Text>
          <Text style={[typography.body, { textAlign: 'center', color: colors.textMuted }]}>{t('calendar.trackdaysText')}</Text>
          <Text style={styles.soon}>{t('common.comingSoon')}</Text>
        </Card>
      ) : null}

      {!showList ? null : (
        <>
          <View style={styles.searchRow}>
            <View style={[styles.search, { flex: 1 }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('calendar.searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                accessibilityLabel={t('calendar.search')}
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => setFilters((f) => ({ ...f, q: search.trim() || null }))}
              />
              {search ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.clearSearch')} hitSlop={10} onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showFilters }}
              accessibilityLabel={t('calendar.filters')}
              onPress={() => setShowFilters((v) => !v)}
              style={[styles.filterButton, (showFilters || hasFilters) && { borderColor: colors.primary }]}
            >
              <Ionicons name="options-outline" size={20} color={hasFilters ? colors.primary : colors.text} />
            </Pressable>
          </View>

          {section === 'regattas' ? (
            <View style={styles.segment} role="tablist">
              {WHEN.map((when) => {
                const selected = filters.when === when;
                return (
                  <Pressable
                    key={when}
                    role="tab"
                    aria-selected={selected}
                    onPress={() => set({ when, month: null })}
                    style={[styles.segmentItem, selected && styles.segmentSelected]}
                  >
                    <Text style={[styles.segmentText, selected && { color: '#fff' }]}>{t(`calendar.${when}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!showFilters ? null : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.types}>
                <Chip label={t('calendar.allTypes')} selected={!filters.type} onPress={() => set({ type: null })} />
                {EVENT_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={t(`calendar.types.${type}`)}
                    selected={filters.type === type}
                    onPress={() => set({ type: filters.type === type ? null : (type as EventType) })}
                  />
                ))}
              </ScrollView>

              <View style={styles.filters}>
                <View style={styles.filter}>
                  <SelectField
                    label={t('calendar.country')}
                    value={filters.country ?? null}
                    placeholder={t('calendar.anyCountry')}
                    options={countries.map((c) => ({ value: c.iso_code, label: c.name }))}
                    onChange={(v) => set({ country: v, club: null })}
                  />
                </View>
                <View style={styles.filter}>
                  <SelectField
                    label={t('calendar.boatClass')}
                    value={filters.boatClass ?? null}
                    placeholder={t('calendar.anyClass')}
                    options={classes.map((c) => ({ value: c.slug, label: c.name }))}
                    onChange={(v) => set({ boatClass: v })}
                  />
                </View>
                <View style={styles.filter}>
                  <SelectField
                    label={t('calendar.club')}
                    value={filters.club ? String(filters.club) : null}
                    placeholder={t('calendar.anyClub')}
                    options={clubs.map((c) => ({ value: String(c.id), label: c.name, hint: c.city }))}
                    onChange={(v) => set({ club: v ? Number(v) : null })}
                  />
                </View>
                <View style={styles.filter}>
                  <SelectField
                    label={t('calendar.month')}
                    value={filters.month ?? null}
                    placeholder={t('calendar.anyMonth')}
                    options={months}
                    onChange={(v) => set({ month: v })}
                  />
                </View>
              </View>
            </>
          )}

          <View style={styles.summary}>
            <Text style={typography.caption}>{loading ? ' ' : t('calendar.count', { count })}</Text>
            {hasFilters ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  setSearch('');
                  setFilters({ when: filters.when });
                }}
              >
                <Text style={styles.link}>{t('calendar.clearFilters')}</Text>
              </Pressable>
            ) : null}
          </View>

          {needsLogin ? (
            <Card style={{ alignItems: 'center' }}>
              <Ionicons name="star-outline" size={28} color={colors.primary} />
              <Text style={[typography.body, { textAlign: 'center' }]}>{t('calendar.followingLogin')}</Text>
              <Button title={t('calendar.signIn')} onPress={() => router.push({ pathname: '/login', params: { next: '/races' } })} />
            </Card>
          ) : null}

          {!needsLogin && loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} /> : null}

          {!needsLogin && !loading && error ? (
            <Card style={{ alignItems: 'center' }}>
              <Text style={typography.caption}>{t('calendar.loadError')}</Text>
              <Text style={[typography.caption, { color: colors.danger }]}>{errorMessage(error, t)}</Text>
              <Button title={t('profile.retry')} variant="ghost" onPress={() => setFilters({ ...filters })} />
            </Card>
          ) : null}

          {!needsLogin && !loading && !error && events.length === 0 ? (
            <Card style={{ alignItems: 'center' }}>
              <Text style={typography.caption}>
                {filters.q ? t('calendar.noSearchResults', { q: filters.q }) : hasFilters ? t('calendar.empty') : t(EMPTY_MESSAGE[filters.when])}
              </Text>
            </Card>
          ) : null}

          {/* La primera, grande y con foto (como el boceto); el resto, agrupado por mes. */}
          {!needsLogin && !loading && hero ? <HeroEvent event={hero} /> : null}

          {!needsLogin &&
            !loading &&
            groupBy(rest, i18n.language).map((group) => (
              <View key={group.key} style={{ gap: spacing.sm }}>
                <Text style={typography.label}>{group.label}</Text>
                {group.items.map((event) => (
                  <EventRow key={event.id} event={event} classLabel={(slug) => className(classes, slug)} />
                ))}
              </View>
            ))}

          {!loading && nextPage ? <Button title={t('calendar.loadMore')} variant="secondary" onPress={loadMore} loading={loadingMore} /> : null}
        </>
      )}
    </Screen>
  );
}

/** Agrupa por mes de inicio, respetando el orden que manda la API. */
function groupBy(events: EventSummary[], language: string) {
  const result: { key: string; label: string; items: EventSummary[] }[] = [];
  for (const event of events) {
    const d = parseDate(event.start_date);
    const key = event.start_date.slice(0, 7);
    if (result.at(-1)?.key !== key) {
      const label = d.toLocaleDateString(language, { month: 'long', year: 'numeric' });
      result.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] });
    }
    result.at(-1)!.items.push(event);
  }
  return result;
}

/** Tarjeta grande con la foto del evento, el nombre, el lugar y "Ver evento". */
function HeroEvent({ event }: { event: EventSummary }) {
  const { t } = useTranslation();
  const open = () => router.push({ pathname: '/events/[slug]', params: { slug: event.slug } });
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={event.name}
      onPress={open}
      style={({ pressed }) => [styles.hero, pressed && { opacity: 0.9 }]}
    >
      {event.cover ? (
        <Image source={{ uri: event.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={StyleSheet.absoluteFill}>
          <RegattaArt />
        </View>
      )}
      <View style={styles.heroShade} />
      <View style={styles.heroBody}>
        {event.status === 'live' ? (
          <View style={[styles.liveBadge, { alignSelf: 'flex-start' }]}>
            <Text style={styles.liveText}>{t('calendar.liveBadge')}</Text>
          </View>
        ) : null}
        <View style={styles.heroTitleRow}>
          <View style={styles.heroAccent} />
          <Text style={styles.heroTitle} numberOfLines={2}>
            {event.name}
          </Text>
        </View>
        <View style={styles.heroBottom}>
          <View style={styles.heroPlace}>
            <Ionicons name="location-outline" size={16} color="#fff" />
            <Text style={styles.heroPlaceText} numberOfLines={1}>
              {[event.city, event.country_name].filter(Boolean).join(', ')}
            </Text>
          </View>
          <View style={styles.heroButton}>
            <Text style={styles.heroButtonText}>{t('calendar.seeEvent')}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.background} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function EventRow({ event, classLabel }: { event: EventSummary; classLabel: (slug: string) => string }) {
  const { t, i18n } = useTranslation();
  const start = parseDate(event.start_date);
  const end = event.end_date ? parseDate(event.end_date) : null;
  const shortMonth = (d: Date) => d.toLocaleDateString(i18n.language, { month: 'short' }).replace('.', '').toUpperCase();
  const multiDay = end !== null && end.getTime() !== start.getTime();
  const sameMonth = !end || (end.getMonth() === start.getMonth() && end.getFullYear() === start.getFullYear());
  // "7–13 / MAR", o "26–3 / MAR–ABR" si termina en otro mes.
  const days = multiDay ? `${start.getDate()}–${end!.getDate()}` : String(start.getDate());
  const month = sameMonth ? shortMonth(start) : `${shortMonth(start)}–${shortMonth(end!)}`;
  const live = event.status === 'live';
  const classes = event.boat_classes.slice(0, 3).map(classLabel);
  const extra = event.boat_classes.length - classes.length;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/events/[slug]', params: { slug: event.slug } })}
      style={({ pressed }) => [styles.row, live && { borderColor: colors.live }, pressed && { opacity: 0.75 }]}
    >
      {event.cover ? (
        <View style={styles.thumbWrap}>
          <Image source={{ uri: event.cover }} style={styles.thumb} resizeMode="cover" />
          <Text style={styles.thumbDate} numberOfLines={1}>
            {days} {month}
          </Text>
        </View>
      ) : (
        <View style={[styles.date, live && { borderColor: colors.live }]}>
          <Text style={styles.dateDays} numberOfLines={1} adjustsFontSizeToFit>
            {days}
          </Text>
          <Text style={styles.dateMonth} numberOfLines={1} adjustsFontSizeToFit>
            {month}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.titleRow}>
          <Text style={[typography.body, styles.title]} numberOfLines={2}>
            {event.name}
          </Text>
          {live ? (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>{t('calendar.liveBadge')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={typography.caption} numberOfLines={1}>
          {[event.city, event.country_name].filter(Boolean).join(' · ')}
          {!event.end_date ? ` · ${t('calendar.startOnly')}` : ''}
        </Text>
        <View style={styles.tags}>
          <Text style={styles.typeTag}>{t(`calendar.types.${event.event_type}`)}</Text>
          {classes.map((label) => (
            <Text key={label} style={styles.classTag}>
              {label}
            </Text>
          ))}
          {extra > 0 ? <Text style={styles.classTag}>+{extra}</Text> : null}
        </View>
        {event.organizer ? (
          <Text style={typography.caption} numberOfLines={1}>
            {event.organizer}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ alignSelf: 'center' }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headingLine: { flex: 1, height: 1, backgroundColor: '#2fd4e0', opacity: 0.6 },
  headingText: { color: colors.text, fontFamily: fonts.display, fontSize: 30 },
  sections: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.45)',
    backgroundColor: 'rgba(11,23,48,0.85)',
  },
  sectionItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm + 2, borderRadius: radius.pill },
  sectionText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  soon: { color: colors.primary, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    justifyContent: 'flex-end',
  },
  heroShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,11,24,0.35)' },
  heroBody: { padding: spacing.lg, gap: spacing.sm },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroAccent: { width: 4, height: 26, borderRadius: 2, backgroundColor: '#2fd4e0', transform: [{ skewX: '-15deg' }] },
  heroTitle: { flex: 1, color: '#fff', fontFamily: fonts.display, fontSize: 22, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 },
  heroBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  heroPlace: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  heroPlaceText: { color: '#fff', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: '#2fd4e0',
  },
  heroButtonText: { color: colors.background, fontFamily: fonts.heading, fontSize: 14 },
  thumbWrap: { width: 72, gap: 4, alignItems: 'center' },
  thumb: { width: 72, height: 56, borderRadius: radius.sm },
  thumbDate: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
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
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { color: colors.textMuted, fontWeight: '700' },
  types: { gap: spacing.sm, paddingRight: spacing.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  filter: { flexBasis: '45%', flexGrow: 1, minWidth: 150 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  date: {
    width: 64,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  dateDays: { color: colors.text, fontWeight: '800', fontSize: 18 },
  dateMonth: { color: colors.primary, fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontWeight: '700' },
  liveBadge: { backgroundColor: colors.live, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeTag: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  classTag: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
