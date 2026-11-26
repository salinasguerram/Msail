import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getRanking, getRankingOptions, type Division, type RankingEntry, type RankingOptions } from '@/api/ranking';
import { errorMessage } from '@/auth/errors';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { colors, fonts, radius, spacing, typography } from '@/theme';
import { DemoNotice } from '@/components/DemoNotice';

const MEDALS = ['#f5c542', '#c9d3e0', '#d9925b'];
const ALL = 'all';

/**
 * Ranking deportivo de MSAIL: por temporada, tipo de barco, clase, división (Abierta, Femenina, Sub-17...) y país.
 * Se calcula con los resultados oficiales de las regatas: puntos por puesto según el tamaño de la flota y el nivel
 * de la regata, sumando los mejores resultados de la temporada.
 */
export default function RankingScreen() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<RankingOptions | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [category, setCategory] = useState<string>(ALL);
  const [boatClass, setBoatClass] = useState<string | null>(null);
  const [division, setDivision] = useState<Division>('open');
  const [country, setCountry] = useState<string | null>(null);
  const [table, setTable] = useState<{ key: string; entries: RankingEntry[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getRankingOptions(season ?? undefined)
      .then((data) => {
        if (!active) return;
        setOptions(data);
        if (season === null) setSeason(data.season);
      })
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, [season]);

  const categories = useMemo(() => [...new Set(options?.classes.map((c) => c.category) ?? [])], [options]);
  const classes = useMemo(() => options?.classes.filter((c) => category === ALL || c.category === category) ?? [], [options, category]);
  const current = classes.find((c) => c.slug === boatClass) ?? classes[0] ?? null;
  const divisions = current?.divisions ?? [];
  const currentDivision = divisions.includes(division) ? division : (divisions[0] ?? 'open');

  const tableKey = current && season ? `${season}|${current.slug}|${currentDivision}|${country ?? ''}` : null;
  useEffect(() => {
    if (!tableKey || !current || !season) return undefined;
    let active = true;
    getRanking({ season, boatClass: current.slug, division: currentDivision, country })
      .then((data) => active && setTable({ key: tableKey, entries: data.entries }))
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, [tableKey, current, season, currentDivision, country]);

  const entries = table?.key === tableKey ? table.entries : null;

  if (error && !options) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center' }}>
          <Text style={[typography.body, { textAlign: 'center' }]}>{errorMessage(error, t)}</Text>
          <Button title={t('profile.retry')} variant="ghost" onPress={() => setError(null)} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="podium" size={26} color={MEDALS[0]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('ranking.title')}</Text>
          <Text style={typography.caption}>{t('ranking.subtitle')}</Text>
        </View>
      </View>

      {options && season !== null ? (
        <SeasonPicker
          season={season}
          seasons={options.seasons}
          onChange={(next) => {
            setSeason(next);
            setBoatClass(null);
            setOpen(null);
          }}
        />
      ) : null}

      {!options ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : !options.classes.length ? (
        <Card style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="podium-outline" size={32} color={colors.primary} />
          <Text style={[typography.body, { textAlign: 'center' }]}>{t('ranking.empty', { season: options.season })}</Text>
        </Card>
      ) : (
        <>
          {options.has_demo ? <DemoNotice text={t('ranking.demo')} /> : null}
          {/* Filtros: temporada, tipo de barco, clase, división y país. */}
          <View style={{ gap: spacing.sm }}>
            {categories.length > 1 ? (
              <Pills
                items={[{ key: ALL, label: t('ranking.allTypes') }, ...categories.map((c) => ({ key: c, label: t(`ranking.categories.${c}`) }))]}
                selected={category}
                onSelect={(c) => {
                  setCategory(c);
                  setBoatClass(null);
                }}
              />
            ) : null}
            <Pills items={classes.map((c) => ({ key: c.slug, label: c.name }))} selected={current?.slug ?? null} onSelect={setBoatClass} strong />
            <View style={styles.filterRow}>
              {divisions.length > 1 ? (
                <Pills
                  items={divisions.map((d) => ({ key: d, label: t(`ranking.divisions.${d}`) }))}
                  selected={currentDivision}
                  onSelect={(d) => setDivision(d as Division)}
                />
              ) : null}
              {options.countries.length > 1 ? (
                <Pills
                  items={[{ key: ALL, label: t('ranking.allCountries') }, ...options.countries.map((c) => ({ key: c.iso, label: c.name }))]}
                  selected={country ?? ALL}
                  onSelect={(c) => setCountry(c === ALL ? null : c)}
                />
              ) : null}
            </View>
          </View>

          {!entries ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : !entries.length ? (
            <Card>
              <Text style={typography.caption}>{t('ranking.noEntries')}</Text>
            </Card>
          ) : (
            <>
              <Podium entries={entries.slice(0, 3)} />
              <View style={styles.table}>
                {entries.map((entry) => (
                  <Row key={entry.key} entry={entry} open={open === entry.key} onToggle={() => setOpen(open === entry.key ? null : entry.key)} />
                ))}
              </View>
            </>
          )}

          <Pressable accessibilityRole="button" onPress={() => setRulesOpen((v) => !v)} style={styles.rulesToggle}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.rulesToggleText}>{t('ranking.howTitle')}</Text>
            <Ionicons name={rulesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </Pressable>
          {rulesOpen ? (
            <Card style={{ gap: spacing.sm }}>
              <Text style={typography.body}>{t('ranking.howPoints')}</Text>
              <Text style={typography.body}>{t('ranking.howBest', { count: options.rules.best_of, fleet: options.rules.min_fleet })}</Text>
              <View style={styles.levels}>
                {options.rules.levels.map((level) => (
                  <View key={level.key} style={styles.level}>
                    <Text style={styles.levelName}>{t(`ranking.levels.${level.key}`)}</Text>
                    <Text style={styles.levelCoef}>×{level.coefficient.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
                  </View>
                ))}
              </View>
              <Text style={typography.caption}>{t('ranking.howOfficial')}</Text>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** «Temporada» y un selector con los años que tienen resultados, del más nuevo al más viejo. */
function SeasonPicker({ season, seasons, onChange }: { season: number; seasons: number[]; onChange: (season: number) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const years = [...new Set(seasons.length ? seasons : [season])].sort((a, b) => b - a);
  return (
    <View style={styles.season}>
      <Text style={styles.seasonLabel}>{t('ranking.seasonLabel')}</Text>
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('ranking.seasonLabel')} ${season}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={({ pressed }) => [styles.yearButton, (open || pressed) && { borderColor: colors.primary }]}
        >
          <Text style={styles.yearText}>{season}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        {open ? (
          <View style={styles.yearMenu} accessibilityRole="menu">
            {years.map((year) => (
              <Pressable
                key={year}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: year === season }}
                onPress={() => {
                  setOpen(false);
                  if (year !== season) onChange(year);
                }}
                style={({ pressed }) => [styles.yearOption, year === season && styles.yearOptionActive, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.yearOptionText, year === season && { color: '#fff' }]}>{year}</Text>
                {year === season ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Pills({
  items,
  selected,
  onSelect,
  strong = false,
}: {
  items: { key: string; label: string }[];
  selected: string | null;
  onSelect: (key: string) => void;
  strong?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
      {items.map((item) => {
        const active = item.key === selected;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.key)}
            style={[styles.pill, strong && styles.pillStrong, active && styles.pillActive]}
          >
            <Text style={[styles.pillText, strong && { fontSize: 14 }, active && { color: '#fff' }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** Los tres primeros: el 1º al medio y más alto, como un podio. */
function Podium({ entries }: { entries: RankingEntry[] }) {
  const order = [entries[1], entries[0], entries[2]];
  const heights = [70, 96, 54];
  return (
    <View style={styles.podium}>
      {order.map((entry, i) =>
        entry ? (
          <View key={entry.key} style={styles.podiumSpot}>
            <Avatar uri={entry.sailor?.avatar ?? null} initials={initials(entry.name)} size={i === 1 ? 64 : 52} />
            <Text style={styles.podiumName} numberOfLines={2}>
              {entry.name}
            </Text>
            <Text style={styles.podiumPoints}>{entry.points.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts</Text>
            <View style={[styles.step, { height: heights[i], borderColor: MEDALS[entry.rank - 1] ?? colors.border }]}>
              <Text style={[styles.stepRank, { color: MEDALS[entry.rank - 1] ?? colors.text }]}>{entry.rank}</Text>
            </View>
          </View>
        ) : (
          <View key={i} style={styles.podiumSpot} />
        ),
      )}
    </View>
  );
}

function Row({ entry, open, onToggle }: { entry: RankingEntry; open: boolean; onToggle: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <View style={[styles.row, open && { borderColor: colors.primary }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.rowMain}>
        <Text style={[styles.rank, entry.rank <= 3 && { color: MEDALS[entry.rank - 1] }]}>{entry.rank}</Text>
        <Movement entry={entry} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={typography.caption} numberOfLines={1}>
            {[entry.sail_number, entry.boat_name !== entry.name ? entry.boat_name : null, entry.country_name].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.points}>{entry.points.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}</Text>
          <Text style={typography.caption}>{t('ranking.regattas', { count: entry.events })}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.details}>
          {entry.results.map((result) => (
            <Pressable
              key={`${result.event.slug}:${result.category ?? ''}`}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/events/[slug]', params: { slug: result.event.slug } })}
              style={styles.result}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[typography.body, !result.counted && { color: colors.textMuted }]} numberOfLines={1}>
                  {result.event.name}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {[
                    result.position ? t('ranking.place', { position: result.position, fleet: result.fleet }) : result.status.toUpperCase(),
                    t(`ranking.levels.${result.level}`),
                    result.category,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Text style={[styles.resultPoints, !result.counted && styles.discarded]}>
                {result.points.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}
              </Text>
            </Pressable>
          ))}
          {entry.results.some((r) => !r.counted) ? <Text style={typography.caption}>{t('ranking.discarded')}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function Movement({ entry }: { entry: RankingEntry }) {
  const { t } = useTranslation();
  if (entry.is_new) return <Text style={[styles.move, { color: colors.primary }]}>{t('ranking.new')}</Text>;
  if (!entry.movement) return <Text style={[styles.move, { color: colors.textMuted }]}>–</Text>;
  const up = entry.movement > 0;
  return (
    <View style={styles.moveBox} accessibilityLabel={t(up ? 'ranking.up' : 'ranking.down', { count: Math.abs(entry.movement) })}>
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={12} color={up ? colors.success : colors.danger} />
      <Text style={[styles.move, { color: up ? colors.success : colors.danger }]}>{Math.abs(entry.movement)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245,197,66,0.5)',
    backgroundColor: 'rgba(245,197,66,0.1)',
  },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 26 },
  filterRow: { gap: spacing.sm },
  season: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, zIndex: 10 },
  seasonLabel: { color: colors.text, fontFamily: fonts.heading, fontSize: 17 },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 120,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  yearText: { color: colors.text, fontFamily: fonts.display, fontSize: 18 },
  yearMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    left: 0,
    marginTop: 4,
    padding: 4,
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    zIndex: 20,
    elevation: 6,
  },
  yearOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  yearOptionActive: { backgroundColor: colors.primary },
  yearOptionText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  pills: { gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillStrong: { paddingVertical: spacing.sm },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 13 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingTop: spacing.md },
  podiumSpot: { flex: 1, alignItems: 'center', gap: 4 },
  podiumName: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13, textAlign: 'center' },
  podiumPoints: { color: colors.textMuted, fontSize: 12 },
  step: {
    alignSelf: 'stretch',
    marginTop: spacing.xs,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderWidth: 1,
    borderBottomWidth: 0,
    backgroundColor: 'rgba(17,33,63,0.9)',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  stepRank: { fontFamily: fonts.display, fontSize: 24 },
  table: { gap: spacing.sm },
  row: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  rank: { width: 28, color: colors.text, fontFamily: fonts.display, fontSize: 18, textAlign: 'center' },
  moveBox: { width: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  move: { width: 30, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  rowName: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  points: { color: colors.text, fontFamily: fonts.heading, fontSize: 17 },
  details: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  resultPoints: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  discarded: { color: colors.textMuted, textDecorationLine: 'line-through' },
  rulesToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start' },
  rulesToggleText: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 14 },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  level: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  levelName: { color: colors.text, fontSize: 13 },
  levelCoef: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});
