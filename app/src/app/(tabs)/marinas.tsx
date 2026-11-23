import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getMarinaCountries, getMarinas, MARINA_SERVICES, PLACE_KINDS, type MarinaFilters, type MarinaSummary } from '@/api/marinas';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { MarinaServices } from '@/components/MarinaServices';
import { Screen } from '@/components/Screen';
import { ServicesSwitch } from '@/components/ServicesSwitch';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing, typography } from '@/theme';
import { formatMoney } from '@/utils/marinaRates';
import { BrandCover } from '@/components/BrandCover';

const SEARCH_DEBOUNCE_MS = 350;
const meters = (value: string) => value.replace(',', '.').replace(/[^\d.]/g, '').slice(0, 6);

/** Directorio de marinas con buscador y filtros por país, servicios y medidas del barco. */
export default function MarinasScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [filters, setFilters] = useState<MarinaFilters>({});
  const [search, setSearch] = useState('');
  const [length, setLength] = useState('');
  const [draft, setDraft] = useState('');
  const [countries, setCountries] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    getMarinaCountries()
      .then((data) => setCountries(data.countries))
      .catch(() => {});
  }, []);

  // Texto y medidas se aplican cuando se deja de escribir.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => {
        const next = { ...f, q: search.trim() || null, length: Number(length) > 0 ? length : null, draft: Number(draft) > 0 ? draft : null };
        return next.q === (f.q ?? null) && next.length === (f.length ?? null) && next.draft === (f.draft ?? null) ? f : next;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, length, draft]);

  const services = filters.services ?? [];
  const toggleService = (service: (typeof MARINA_SERVICES)[number]) =>
    setFilters((f) => {
      const current = f.services ?? [];
      return { ...f, services: current.includes(service) ? current.filter((s) => s !== service) : [...current, service] };
    });
  const hasFilters = Boolean(filters.q || filters.kind || filters.country || services.length || filters.length || filters.draft || filters.withPrice);

  function clear() {
    setSearch('');
    setLength('');
    setDraft('');
    setFilters({});
  }

  return (
    <Screen>
      <ServicesSwitch current="marinas" />
      <Text style={typography.caption}>{t('services.berthsIntro')}</Text>
      {/* Tipo de lugar: marinas, clubes, fondeaderos o campos de boyas. */}
      <View style={styles.chips}>
        <Chip label={t('services.allPlaces')} selected={!filters.kind} onPress={() => setFilters((f) => ({ ...f, kind: null }))} />
        {PLACE_KINDS.map((kind) => (
          <Chip
            key={kind}
            label={t(`services.kinds.${kind}`)}
            selected={filters.kind === kind}
            onPress={() => setFilters((f) => ({ ...f, kind: f.kind === kind ? null : kind }))}
          />
        ))}
      </View>
      {user ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/marinas/requests')}
          style={({ pressed }) => [styles.myRequests, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="file-tray-full-outline" size={18} color={colors.primary} />
          <Text style={[styles.link, { flex: 1 }]}>{t('berth.myRequests')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('marinas.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          accessibilityLabel={t('marinas.search')}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.clearSearch')} hitSlop={10} onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filters}>
        <View style={styles.country}>
          <SelectField
            label={t('calendar.country')}
            value={filters.country ?? null}
            placeholder={t('calendar.anyCountry')}
            options={countries}
            onChange={(v) => setFilters((f) => ({ ...f, country: v }))}
          />
        </View>
        <View style={styles.size}>
          <TextField
            label={t('marinas.myLength')}
            value={length}
            onChangeText={(v) => setLength(meters(v))}
            keyboardType="decimal-pad"
            placeholder="12"
          />
        </View>
        <View style={styles.size}>
          <TextField
            label={t('marinas.myDraft')}
            value={draft}
            onChangeText={(v) => setDraft(meters(v))}
            keyboardType="decimal-pad"
            placeholder="2.1"
          />
        </View>
      </View>

      <View style={styles.chips}>
        <Chip
          label={t('marinas.withPrice')}
          selected={!!filters.withPrice}
          onPress={() => setFilters((f) => ({ ...f, withPrice: !f.withPrice }))}
        />
        {MARINA_SERVICES.map((service) => (
          <Chip
            key={service}
            label={t(`marinas.services.${service}`)}
            selected={services.includes(service)}
            onPress={() => toggleService(service)}
          />
        ))}
      </View>

      <Results key={JSON.stringify(filters)} filters={filters} hasFilters={hasFilters} onClear={clear} />
    </Screen>
  );
}

function Results({ filters, hasFilters, onClear }: { filters: MarinaFilters; hasFilters: boolean; onClear: () => void }) {
  const { t } = useTranslation();
  const [marinas, setMarinas] = useState<MarinaSummary[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // El estado se toca solo cuando llega la respuesta (o en "Cargar más").
  const fetchPage = useCallback(
    (next: number) =>
      getMarinas(filters, next)
        .then((data) => {
          setMarinas((list) => (next === 1 ? data.results : [...list, ...data.results]));
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
        <Text style={typography.caption}>{loading && !marinas.length ? ' ' : t('marinas.found', { count })}</Text>
        {hasFilters ? (
          <Pressable accessibilityRole="button" onPress={onClear} hitSlop={8}>
            <Text style={styles.link}>{t('calendar.clearFilters')}</Text>
          </Pressable>
        ) : null}
      </View>

      {!loading && !error && marinas.length === 0 ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[typography.body, { textAlign: 'center' }]}>{hasFilters ? t('marinas.noResults') : t('marinas.empty')}</Text>
        </Card>
      ) : null}

      {marinas.map((marina) => (
        <MarinaRow key={marina.id} marina={marina} length={filters.length ?? null} />
      ))}

      {error ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[typography.caption, { color: colors.danger }]}>{errorMessage(error, t)}</Text>
        </Card>
      ) : null}
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

function MarinaRow({ marina, length }: { marina: MarinaSummary; length: string | null }) {
  const { t, i18n } = useTranslation();
  const rate = marina.headline_rate;
  const sizes = [
    marina.max_length_m ? t('marinas.upToLength', { value: marina.max_length_m }) : null,
    marina.max_draft_m ? t('marinas.depthValue', { value: marina.max_draft_m }) : null,
    marina.berths ? t('marinas.berthsCount', { count: marina.berths }) : null,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() =>
        router.push({ pathname: '/marinas/[slug]', params: length ? { slug: marina.slug, length } : { slug: marina.slug } })
      }
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      {marina.cover ? (
        <Image source={{ uri: marina.cover }} style={styles.cover} />
      ) : (
        <BrandCover compact style={styles.cover} />
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[typography.body, { fontWeight: '700' }]}>{marina.name}</Text>
        <Text style={typography.caption}>
          {[t(`services.kindOne.${marina.kind ?? 'marina'}`), marina.city, marina.country_name].filter(Boolean).join(' · ')}
        </Text>
        {sizes.length ? <Text style={[typography.caption, { color: colors.text }]}>{sizes.join(' · ')}</Text> : null}
        {rate ? (
          <Text style={styles.price}>
            {t('marinas.from', { price: formatMoney(rate.amount, rate.currency, i18n.language), unit: t(`marinas.units.${rate.unit}`) })}
          </Text>
        ) : null}
        {marina.services.length ? <MarinaServices services={marina.services} compact /> : null}
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  country: { flexBasis: '40%', flexGrow: 2, minWidth: 180 },
  size: { flexBasis: '20%', flexGrow: 1, minWidth: 110 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  cover: { width: 76, height: 76, borderRadius: radius.md },
  price: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  myRequests: {
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
