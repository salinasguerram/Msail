import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TFunction } from 'i18next';

import { getCountries } from '@/api/catalogs';
import { getMapPoints, type MapKind, type MapPoint } from '@/api/map';
import { getWindGrid, type WindGrid } from '@/api/weather';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { colors, radius, spacing, typography } from '@/theme';
import { distanceKm } from '@/utils/geo';
import { approximateLocation } from '@/utils/homeLocation';

import { POINT_COLORS, WIND_SCALE } from './globeHtml';
import type { GlobePoint, GlobeTap, WindCell } from './types';

/** Radio de "la zona" alrededor del lugar tocado. */
export const ZONE_RADIUS_KM = 150;
const KINDS: MapKind[] = ['event', 'marina', 'professional'];
const ICONS: Record<MapKind, ComponentProps<typeof Ionicons>['name']> = {
  event: 'trophy-outline',
  marina: 'boat-outline',
  professional: 'construct-outline',
};

type Zone = { lat: number; lng: number; pointId: string | null; iso?: string | null };
type Nearby = GlobePoint & { km: number };

const shortDate = (value: string, language: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(language, { day: 'numeric', month: 'short' });

/** Mini resumen del pin, según el tipo: fechas de la regata, medidas de la marina, puntaje del profesional. */
function summarize(point: MapPoint, t: TFunction, language: string): string {
  if (point.kind === 'event') {
    const dates = point.date
      ? point.end_date
        ? `${shortDate(point.date, language)} – ${shortDate(point.end_date, language)}`
        : shortDate(point.date, language)
      : '';
    return [point.live ? t('event.live') : dates, point.subtitle].filter(Boolean).join(' · ');
  }
  if (point.kind === 'marina') {
    const facts = [
      point.max_length_m ? t('marinas.upToLength', { value: point.max_length_m }) : null,
      point.berths ? t('marinas.berthsCount', { count: point.berths }) : null,
    ].filter(Boolean);
    return [point.subtitle, ...facts].join(' · ');
  }
  const rating = point.rating ? `★ ${point.rating.toFixed(1)} (${point.reviews_count})` : null;
  return [point.subtitle, rating, point.city].filter(Boolean).join(' · ');
}

/** Estado del planeta: puntos, capas, zona elegida (con su país), lo que hay en ella y la capa de viento. */
export function usePlanet({ initialWind = false }: { initialWind?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const [raw, setRaw] = useState<MapPoint[]>([]);
  const [counts, setCounts] = useState<Record<MapKind, number>>({ event: 0, marina: 0, professional: 0 });
  const [layers, setLayers] = useState<Record<MapKind, boolean>>({ event: true, marina: true, professional: true });
  const [zone, setZone] = useState<Zone | null>(null);
  const [country, setCountry] = useState<string | null>(null);

  // Dónde arranca centrado: el país de la cuenta o, si no hay, la zona horaria del dispositivo.
  const { user } = useAuth();
  const [home, setHome] = useState(() => approximateLocation());
  useEffect(() => {
    if (!user?.country) return;
    getCountries()
      .then((list) => {
        const mine = list.find((c) => c.iso_code === user.country);
        if (mine) setHome(approximateLocation(mine));
      })
      .catch(() => {});
  }, [user?.country]);

  // Viento: se pide la grilla recién cuando se prende la capa.
  const [windOn, setWindOn] = useState(initialWind);
  const [windHour, setWindHour] = useState(0);
  const [windGrid, setWindGrid] = useState<WindGrid | null>(null);
  const [windError, setWindError] = useState<unknown>(null);

  useEffect(() => {
    getMapPoints()
      .then((data) => {
        setRaw(data.points);
        setCounts(data.counts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!windOn || windGrid) return;
    getWindGrid().then(setWindGrid).catch(setWindError);
  }, [windOn, windGrid]);

  const points = useMemo<GlobePoint[]>(
    () => raw.map((p) => ({ ...p, typeLabel: t(`planet.types.${p.kind}`), summary: summarize(p, t, i18n.language) })),
    [raw, t, i18n.language],
  );
  const visible = useMemo(() => points.filter((p) => layers[p.kind]), [points, layers]);

  const wind = useMemo<WindCell[] | null>(() => {
    if (!windOn || !windGrid) return null;
    return windGrid.points.map((c) => ({ lat: c.lat, lng: c.lng, speed: c.speed[windHour], direction: c.direction[windHour] }));
  }, [windOn, windGrid, windHour]);

  const nearby = useMemo<Nearby[]>(() => {
    if (!zone) return [];
    return visible
      .map((p) => ({ ...p, km: distanceKm(zone, p) }))
      .filter((p) => p.km <= ZONE_RADIUS_KM)
      .sort((a, b) => a.km - b.km);
  }, [zone, visible]);

  // Si en la zona no hay nada, lo más cercano para ofrecer ir hasta ahí.
  const closest = useMemo<Nearby | null>(() => {
    if (!zone || nearby.length) return null;
    return visible.reduce<Nearby | null>((best, p) => {
      const km = distanceKm(zone, p);
      return !best || km < best.km ? { ...p, km } : best;
    }, null);
  }, [zone, nearby, visible]);

  const onTap = useCallback(
    (tap: GlobeTap) => {
      // Al tocar un pin, la zona se centra en él.
      const point = tap.pointId ? raw.find((p) => p.id === tap.pointId) : null;
      setZone(point ? { lat: point.lat, lng: point.lng, pointId: point.id, iso: point.country } : { lat: tap.lat, lng: tap.lng, pointId: null });
    },
    [raw],
  );

  const goTo = (point: GlobePoint) => setZone({ lat: point.lat, lng: point.lng, pointId: point.id, iso: point.country });
  const clearZone = useCallback(() => {
    setZone(null);
    setCountry(null);
  }, []);
  const toggleLayer = (kind: MapKind) => setLayers((current) => ({ ...current, [kind]: !current[kind] }));
  const showWind = useCallback(() => setWindOn(true), []);
  const hideWind = useCallback(() => setWindOn(false), []);
  const toggleWind = () => {
    setWindError(null);
    setWindOn((on) => !on);
  };
  const retryWind = () => {
    setWindError(null);
    getWindGrid().then(setWindGrid).catch(setWindError);
  };

  return {
    home,
    points,
    counts,
    layers,
    toggleLayer,
    zone,
    goTo,
    clearZone,
    country,
    // Si el planeta no encuentra el país (islas chicas), se usa el del pin tocado.
    onCountry: (c: { name: string | null }) =>
      setCountry(c.name ?? (zone?.pointId ? (raw.find((p) => p.id === zone.pointId)?.country_name ?? null) : null)),
    nearby,
    closest,
    onTap,
    wind: { on: windOn, toggle: toggleWind, show: showWind, hide: hideWind, hour: windHour, setHour: setWindHour, grid: windGrid, cells: wind, error: windError, retry: retryWind },
  };
}

export type Planet = ReturnType<typeof usePlanet>;

/** Chips para mostrar u ocultar regatas, marinas y profesionales en el planeta. */
export function LayerChips({ planet }: { planet: Planet }) {
  const { t } = useTranslation();
  return (
    <View style={styles.layers}>
      {KINDS.map((kind) => {
        const on = planet.layers[kind];
        return (
          <Pressable
            key={kind}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => planet.toggleLayer(kind)}
            style={({ pressed }) => [styles.layer, !on && styles.layerOff, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.dot, { backgroundColor: on ? POINT_COLORS[kind] : colors.border }]} />
            <Text style={[styles.layerText, !on && { color: colors.textMuted }]}>
              {t(`planet.layers.${kind}`)} · {planet.counts[kind]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Botón "Viento" que va arriba del planeta. */
export function WindButton({ planet }: { planet: Planet }) {
  const { t } = useTranslation();
  const on = planet.wind.on;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      onPress={planet.wind.toggle}
      style={({ pressed }) => [styles.windButton, on && styles.windButtonOn, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name="flag-outline" size={16} color={on ? '#fff' : colors.text} />
      <Text style={[styles.windButtonText, on && { color: '#fff' }]}>{t('planet.wind.button')}</Text>
    </Pressable>
  );
}

/** Controles de la capa de viento: hora (ahora, +12, +24, +48 h), leyenda y fuente. */
export function WindControls({ planet }: { planet: Planet }) {
  const { t, i18n } = useTranslation();
  const { wind } = planet;
  if (!wind.on) return null;
  if (wind.error) {
    return (
      <View style={styles.windBox}>
        <Text style={[typography.caption, { color: colors.danger }]}>{errorMessage(wind.error, t)}</Text>
        <Pressable accessibilityRole="button" onPress={wind.retry}>
          <Text style={styles.link}>{t('profile.retry')}</Text>
        </Pressable>
      </View>
    );
  }
  if (!wind.grid) {
    return (
      <View style={[styles.windBox, { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={typography.caption}>{t('planet.wind.loading')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.windBox}>
      <View style={styles.hours} role="tablist">
        {wind.grid.offsets.map((offset, index) => {
          const active = wind.hour === index;
          const when = new Date(wind.grid!.times[index]).toLocaleString(i18n.language, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
          return (
            <Pressable
              key={offset}
              role="tab"
              aria-selected={active}
              accessibilityLabel={when}
              onPress={() => wind.setHour(index)}
              style={[styles.hour, active && styles.hourActive]}
            >
              <Text style={[styles.hourText, active && { color: '#fff' }]}>
                {offset === 0 ? t('planet.wind.now') : `+${offset} h`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        {WIND_SCALE.map((step, index) => (
          <View key={step.knots} style={styles.legendItem}>
            <View style={[styles.legendBar, { backgroundColor: step.color }]} />
            <Text style={styles.legendText}>{index === WIND_SCALE.length - 1 ? `${step.knots}+` : step.knots}</Text>
          </View>
        ))}
        <Text style={styles.legendText}>kn</Text>
      </View>
      <Text style={styles.legendText}>{t('planet.wind.source', { name: wind.grid.source.name })}</Text>
    </View>
  );
}

const openPoint = (point: GlobePoint) => {
  if (point.kind === 'event') router.push({ pathname: '/events/[slug]', params: { slug: point.slug } });
  else if (point.kind === 'marina') router.push({ pathname: '/marinas/[slug]', params: { slug: point.slug } });
  else router.push({ pathname: '/professionals/[slug]', params: { slug: point.slug } });
};

/** Lo que hay en la zona tocada, agrupado por tipo. */
export function ZonePanel({ planet, maxHeight }: { planet: Planet; maxHeight?: number }) {
  const { t, i18n } = useTranslation();
  if (!planet.zone) return null;
  const groups = KINDS.map((kind) => ({ kind, items: planet.nearby.filter((p) => p.kind === kind) })).filter((g) => g.items.length);
  const km = (value: number) => (value < 1 ? '< 1 km' : `${Math.round(value).toLocaleString(i18n.language)} km`);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Ionicons name="locate-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { fontWeight: '800' }]}>
            {planet.country ? `${t('planet.zoneTitle')} · ${planet.country}` : t('planet.zoneTitle')}
          </Text>
          <Text style={typography.caption}>
            {planet.nearby.length
              ? t('planet.zoneSummary', { count: planet.nearby.length, km: ZONE_RADIUS_KM })
              : t('planet.zoneEmpty', { km: ZONE_RADIUS_KM })}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={planet.clearZone} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView style={maxHeight ? { maxHeight } : undefined} contentContainerStyle={{ gap: spacing.md }}>
        {groups.map(({ kind, items }) => (
          <View key={kind} style={{ gap: spacing.xs }}>
            <Text style={typography.label}>
              {t(`planet.layers.${kind}`)} ({items.length})
            </Text>
            {items.map((item) => {
              const color = item.live ? POINT_COLORS.live : POINT_COLORS[item.kind];
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="link"
                  onPress={() => openPoint(item)}
                  style={({ pressed }) => [styles.item, item.id === planet.zone?.pointId && styles.itemSelected, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.itemIcon, { borderColor: color }]}>
                    <Ionicons name={ICONS[item.kind]} size={16} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.body, { fontWeight: '600' }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={typography.caption} numberOfLines={2}>
                      {[item.summary, km(item.km)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        ))}

        {planet.closest ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => planet.goTo(planet.closest!)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="navigate-outline" size={18} color={colors.primary} />
            <Text style={[typography.body, { flex: 1 }]}>
              {t('planet.closest', { name: planet.closest.name, distance: km(planet.closest.km) })}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  layers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  layer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  layerOff: { backgroundColor: 'transparent' },
  layerText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  windButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(11,23,48,0.9)',
  },
  windButtonOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  windButtonText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  windBox: {
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(11,23,48,0.92)',
  },
  hours: { flexDirection: 'row', gap: 4 },
  hour: { paddingHorizontal: spacing.sm + 2, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  hourActive: { backgroundColor: colors.primary },
  hourText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendItem: { alignItems: 'center', gap: 2 },
  legendBar: { width: 24, height: 4, borderRadius: 2 },
  legendText: { color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  panel: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  itemSelected: { borderWidth: 1, borderColor: colors.primary },
  itemIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
