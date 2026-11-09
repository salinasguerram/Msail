import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  getProfessionalFilterOptions,
  getProfessionals,
  type ProfessionalFilterOptions,
  type ProfessionalFilters,
  type ProfessionalSummary,
} from '@/api/professionals';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Stars } from '@/components/Reviews';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/SelectField';
import { colors, radius, spacing, typography } from '@/theme';
import { initialsOf } from '@/utils/text';

type IconName = ComponentProps<typeof Ionicons>['name'];
const SEARCH_DEBOUNCE_MS = 350;
const EMPTY: ProfessionalFilterOptions = { specialties: [], countries: [] };

/** Directorio de profesionales náuticos por especialidad y ubicación. */
export default function ProfessionalsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [filters, setFilters] = useState<ProfessionalFilters>({});
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<ProfessionalFilterOptions>(EMPTY);

  useEffect(() => {
    getProfessionalFilterOptions().then(setOptions).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => ((f.q ?? '') === search.trim() ? f : { ...f, q: search.trim() || null }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const hasFilters = Boolean(filters.q || filters.specialty || filters.country || filters.byRating);
  function clear() {
    setSearch('');
    setFilters({});
  }

  return (
    <Screen>
      {user ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/professionals/quotes')}
          style={({ pressed }) => [styles.myQuotes, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          <Text style={[styles.link, { flex: 1 }]}>{t('quotes.myQuotes')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('professionals.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          accessibilityLabel={t('professionals.search')}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.clearSearch')} hitSlop={10} onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Especialidades: las que tienen profesionales primero, con su ícono */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.specialties}>
        {[...options.specialties]
          .sort((a, b) => Number(b.count > 0) - Number(a.count > 0))
          .map((specialty) => {
            const selected = filters.specialty === specialty.slug;
            return (
              <Pressable
                key={specialty.slug}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => setFilters((f) => ({ ...f, specialty: selected ? null : specialty.slug }))}
                style={({ pressed }) => [styles.specialty, selected && styles.specialtySelected, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name={(specialty.icon || 'construct-outline') as IconName} size={22} color={selected ? '#fff' : colors.primary} />
                <Text style={[styles.specialtyText, selected && { color: '#fff' }]} numberOfLines={2}>
                  {specialty.name}
                </Text>
                <Text style={[styles.count, selected && { color: '#fff' }]}>{specialty.count}</Text>
              </Pressable>
            );
          })}
      </ScrollView>

      <SelectField
        label={t('calendar.country')}
        value={filters.country ?? null}
        placeholder={t('calendar.anyCountry')}
        options={options.countries}
        onChange={(v) => setFilters((f) => ({ ...f, country: v }))}
      />

      <View style={{ flexDirection: 'row' }}>
        <Chip
          label={t('reviews.bestRated')}
          selected={!!filters.byRating}
          onPress={() => setFilters((f) => ({ ...f, byRating: !f.byRating }))}
        />
      </View>

      <Results key={JSON.stringify(filters)} filters={filters} hasFilters={hasFilters} onClear={clear} />
    </Screen>
  );
}

function Results({ filters, hasFilters, onClear }: { filters: ProfessionalFilters; hasFilters: boolean; onClear: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ProfessionalSummary[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // El estado se toca solo cuando llega la respuesta (o en "Cargar más").
  const fetchPage = useCallback(
    (next: number) =>
      getProfessionals(filters, next)
        .then((data) => {
          setItems((list) => (next === 1 ? data.results : [...list, ...data.results]));
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
        <Text style={typography.caption}>{loading && !items.length ? ' ' : t('professionals.found', { count })}</Text>
        {hasFilters ? (
          <Pressable accessibilityRole="button" onPress={onClear} hitSlop={8}>
            <Text style={styles.link}>{t('calendar.clearFilters')}</Text>
          </Pressable>
        ) : null}
      </View>

      {!loading && !error && items.length === 0 ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[typography.body, { textAlign: 'center' }]}>
            {hasFilters ? t('professionals.noResults') : t('professionals.empty')}
          </Text>
        </Card>
      ) : null}

      {items.map((item) => (
        <ProfessionalRow key={item.id} professional={item} />
      ))}

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

function ProfessionalRow({ professional }: { professional: ProfessionalSummary }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/professionals/[slug]', params: { slug: professional.slug } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      {professional.logo ? (
        <Image source={{ uri: professional.logo }} style={styles.logo} />
      ) : (
        <View style={[styles.logo, styles.placeholder]}>
          <Text style={styles.initials}>{initialsOf(professional.name)}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[typography.body, { fontWeight: '700' }]}>{professional.name}</Text>
        <Text style={[typography.caption, { color: colors.primary, fontWeight: '600' }]} numberOfLines={1}>
          {professional.specialties.map((s) => s.name).join(' · ')}
        </Text>
        {professional.headline ? (
          <Text style={typography.caption} numberOfLines={2}>
            {professional.headline}
          </Text>
        ) : null}
        <Text style={typography.caption}>{[professional.city, professional.country_name].filter(Boolean).join(' · ')}</Text>
        {professional.rating !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Stars value={professional.rating} size={12} />
            <Text style={typography.caption}>
              {professional.rating.toFixed(1)} ({professional.reviews_count})
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  specialties: { gap: spacing.sm, paddingRight: spacing.lg },
  specialty: {
    width: 104,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  specialtySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  specialtyText: { color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  count: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  logo: { width: 56, height: 56, borderRadius: 28 },
  placeholder: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.primary, fontWeight: '800', fontSize: 18 },
  myQuotes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
