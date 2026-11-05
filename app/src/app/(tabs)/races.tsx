import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getCountries, searchClubs, type Club, type Country } from '@/api/catalogs';
import { EVENT_TYPES, getEvents, type EventFilters, type EventSummary, type EventType, type EventWhen } from '@/api/events';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/SelectField';
import { colors, radius, spacing, typography } from '@/theme';

const WHEN: EventWhen[] = ['upcoming', 'live', 'past'];

// Sin filtros, el mensaje vacío depende de la pestaña (ej. "No hay regatas en curso en este momento").
const EMPTY_MESSAGE = {
  upcoming: 'calendar.emptyUpcoming',
  live: 'calendar.emptyLive',
  past: 'calendar.emptyPast',
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
  const classes = useBoatClasses();
  const [filters, setFilters] = useState<EventFilters>({ when: 'upcoming' });
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [count, setCount] = useState(0);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);

  useEffect(() => {
    getCountries().then(setCountries).catch(() => {});
  }, [i18n.language]);

  // Los clubes se filtran por el país elegido (si hay uno).
  useEffect(() => {
    searchClubs({ country: filters.country ?? null }).then(setClubs).catch(() => setClubs([]));
  }, [filters.country]);

  useEffect(() => {
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
  }, [filters]);

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
  const hasFilters = Boolean(filters.type || filters.country || filters.club || filters.boatClass || filters.month);
  const months = useMemo(() => monthOptions(filters.when, i18n.language), [filters.when, i18n.language]);

  // Agrupa por mes de inicio, respetando el orden que manda la API.
  const groups = useMemo(() => {
    const result: { key: string; label: string; items: EventSummary[] }[] = [];
    for (const event of events) {
      const d = parseDate(event.start_date);
      const key = event.start_date.slice(0, 7);
      if (result.at(-1)?.key !== key) {
        const label = d.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
        result.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] });
      }
      result.at(-1)!.items.push(event);
    }
    return result;
  }, [events, i18n.language]);

  return (
    <Screen>
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

      <View style={styles.summary}>
        <Text style={typography.caption}>{loading ? ' ' : t('calendar.count', { count })}</Text>
        {hasFilters ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setFilters({ when: filters.when })}>
            <Text style={styles.link}>{t('calendar.clearFilters')}</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} /> : null}

      {!loading && error ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={typography.caption}>{t('calendar.loadError')}</Text>
          <Text style={[typography.caption, { color: colors.danger }]}>{errorMessage(error, t)}</Text>
          <Button title={t('profile.retry')} variant="ghost" onPress={() => setFilters({ ...filters })} />
        </Card>
      ) : null}

      {!loading && !error && events.length === 0 ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={typography.caption}>{hasFilters ? t('calendar.empty') : t(EMPTY_MESSAGE[filters.when])}</Text>
        </Card>
      ) : null}

      {!loading &&
        groups.map((group) => (
          <View key={group.key} style={{ gap: spacing.sm }}>
            <Text style={typography.label}>{group.label}</Text>
            {group.items.map((event) => (
              <EventRow key={event.id} event={event} classLabel={(slug) => className(classes, slug)} />
            ))}
          </View>
        ))}

      {!loading && nextPage ? <Button title={t('calendar.loadMore')} variant="secondary" onPress={loadMore} loading={loadingMore} /> : null}
    </Screen>
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
    <View style={[styles.row, live && { borderColor: colors.live }]}>
      <View style={[styles.date, live && { borderColor: colors.live }]}>
        <Text style={styles.dateDays} numberOfLines={1} adjustsFontSizeToFit>
          {days}
        </Text>
        <Text style={styles.dateMonth} numberOfLines={1} adjustsFontSizeToFit>
          {month}
        </Text>
      </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
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
