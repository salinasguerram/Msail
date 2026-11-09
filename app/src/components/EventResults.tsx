import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { EventDetail, EventResult, EventSailor } from '@/api/events';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { colors, radius, spacing, typography } from '@/theme';

const MEDALS = ['#f5c542', '#c9d1dc', '#d08a4f'];

/** Bandera a partir del código ISO del país (ej. "ES" → 🇪🇸). */
const flag = (iso: string | null) =>
  iso && /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '';

/** Clasificación de la regata, por categoría. */
export function EventResults({ event }: { event: EventDetail }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(0);
  const groups = event.results;
  const officialUrl = event.results_url || event.website;

  if (groups.length === 0) {
    // Solo se avisa en las regatas que ya terminaron o están en curso.
    if (event.status === 'upcoming') return null;
    return (
      <Card>
        <Text style={typography.label}>{t('event.results')}</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {event.status === 'live' ? t('event.resultsLive') : t('event.resultsPending')}
        </Text>
        {event.results_url ? <OfficialLink url={event.results_url} label={t('event.fullResults')} /> : null}
      </Card>
    );
  }

  const group = groups[Math.min(selected, groups.length - 1)];
  return (
    <Card>
      <Text style={typography.label}>{t('event.results')}</Text>
      {groups.length > 1 ? (
        <View style={styles.tabs} role="tablist">
          {groups.map((g, index) => {
            const active = index === selected;
            return (
              <Pressable
                key={g.category ?? 'general'}
                role="tab"
                aria-selected={active}
                onPress={() => setSelected(index)}
                style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.tabText, active && { color: '#fff' }]}>{g.category ?? t('event.overall')}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : group.category ? (
        <Text style={[typography.body, { fontWeight: '700' }]}>{group.category}</Text>
      ) : null}

      <View>
        {group.results.map((result, index) => (
          <ResultRow key={`${result.boat_name}-${index}`} result={result} />
        ))}
      </View>

      {event.results_partial ? <Text style={typography.caption}>{t('event.resultsPartial')}</Text> : null}
      {officialUrl ? (
        <OfficialLink url={officialUrl} label={event.results_url ? t('event.fullResults') : t('event.website')} />
      ) : null}
    </Card>
  );
}

function ResultRow({ result }: { result: EventResult }) {
  const { t } = useTranslation();
  const medal = result.position && result.position <= 3 ? MEDALS[result.position - 1] : null;
  const subtitle = [result.sail_number, result.skipper, result.club].filter(Boolean).join(' · ');
  const score =
    result.points !== null ? t('event.points', { count: result.points }) : result.time || null;

  const content = (
    <>
      <View style={[styles.position, medal ? { backgroundColor: medal } : null]}>
        <Text style={[styles.positionText, medal ? { color: colors.background } : null]}>
          {result.position ?? result.status.toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.body, { fontWeight: '700' }]}>
          {[flag(result.country), result.boat_name].filter(Boolean).join(' ')}
        </Text>
        {subtitle ? <Text style={typography.caption}>{subtitle}</Text> : null}
        {result.notes ? <Text style={[typography.caption, { color: colors.primary }]}>{result.notes}</Text> : null}
      </View>
      {score ? <Text style={styles.score}>{score}</Text> : null}
      {result.boat ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </>
  );

  if (!result.boat) return <View style={styles.row}>{content}</View>;
  const boatId = String(result.boat);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint={t('event.openBoat')}
      onPress={() => router.push({ pathname: '/boats/[id]', params: { id: boatId } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  );
}

/** Navegantes de MSAIL que cargaron su resultado en esta regata. */
export function EventSailors({ sailors }: { sailors: EventSailor[] }) {
  const { t } = useTranslation();
  if (sailors.length === 0) return null;
  return (
    <Card>
      <Text style={typography.label}>{t('event.msailSailors')}</Text>
      {sailors.map((sailor) => (
        <Pressable
          key={sailor.result_id}
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/results/[id]', params: { id: String(sailor.result_id) } })}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        >
          <Avatar
            uri={sailor.avatar}
            size={40}
            initials={sailor.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.body, { fontWeight: '700' }]}>{sailor.name}</Text>
            <Text style={typography.caption}>
              {[
                sailor.fleet_size
                  ? t('event.placeOf', { position: sailor.position, count: sailor.fleet_size })
                  : t('event.place', { position: sailor.position }),
                sailor.boat_name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

function OfficialLink({ url, label }: { url: string; label: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} style={styles.link} hitSlop={6}>
      <Ionicons name="open-outline" size={16} color={colors.primary} />
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  position: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 4,
    borderRadius: 18,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  score: { color: colors.text, fontWeight: '700', fontSize: 13 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  linkText: { color: colors.primary, fontWeight: '600' },
});
