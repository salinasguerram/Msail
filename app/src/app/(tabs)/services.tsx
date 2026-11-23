import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { getMarinas, type MarinaSummary } from '@/api/marinas';
import { getProfessionals, type ProfessionalSummary } from '@/api/professionals';
import { getArea, getWeatherPlaces, type AreaForecast, type AreaPoint } from '@/api/weather';
import { useAuth } from '@/auth/AuthContext';
import { setPlanetFocus } from '@/components/explore/planetFocus';
import type { FieldKind } from '@/components/globe/globeHtml';
import { Screen } from '@/components/Screen';
import { colors, fonts, radius, spacing } from '@/theme';
import { distanceKm } from '@/utils/geo';
import { herePlace, locateMe, type Coords } from '@/utils/myLocation';

type IconName = ComponentProps<typeof Ionicons>['name'];

const CATEGORIES: { key: 'repair' | 'berths' | 'crew' | 'training'; icon: IconName; href: Href }[] = [
  { key: 'repair', icon: 'construct-outline', href: { pathname: '/professionals', params: { specialty: 'rigging' } } },
  { key: 'berths', icon: 'boat-outline', href: '/marinas' },
  { key: 'crew', icon: 'people-outline', href: '/crew' },
  { key: 'training', icon: 'school-outline', href: { pathname: '/msailing', params: { section: 'school' } } },
];

const LAYERS: FieldKind[] = ['wind', 'currents', 'waves'];

// Alto del mapa (fracción de la pantalla): se agranda tirando la manija del panel hacia abajo.
const MAP_SMALL = 0.3;
const MAP_BIG = 0.62;
// Barra de arriba de la pantalla + pestañas Viento / Corriente / Oleaje (para centrar el lugar en el hueco del mapa).
const HEADER_ESTIMATE = 60;
// Bien de cerca (vista satelital), como el boceto: se ven las marinas de la zona con su nombre.
const MAP_ALTITUDE = 0.22;

function valueOf(point: AreaPoint, kind: FieldKind) {
  if (kind === 'wind') return { value: point.wind[0], direction: point.wind_dir[0] };
  if (kind === 'waves') return { value: point.wave[0], direction: point.wave_dir[0] };
  return { value: point.current[0], direction: point.current_dir[0] };
}

/**
 * Servicios náuticos (boceto «Marine Services» de Miguel): el mapa satelital de tu zona con Viento / Corriente /
 * Oleaje y las marinas cercanas con su nombre; abajo un panel que se arrastra, con el buscador de servicios,
 * los cuatro accesos (reparación, amarres, tripulaciones y formación) y el profesional más cercano destacado.
 */
export default function ServicesScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { height } = useWindowDimensions();
  const [here, setHere] = useState<Coords | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [featured, setFeatured] = useState<(ProfessionalSummary & { km: number }) | null>(null);
  const [area, setArea] = useState<AreaForecast | null>(null);
  const [kind, setKind] = useState<FieldKind | null>('wind');

  // Mapa: se agranda tirando la manija hacia abajo (o tocándola), como en Eventos.
  const [mapRatio, setMapRatio] = useState(MAP_SMALL);
  const [dragFrom, setDragFrom] = useState<{ y: number; ratio: number; moved: boolean } | null>(null);
  const mapHeight = Math.round(height * mapRatio);
  const middle = (MAP_SMALL + MAP_BIG) / 2;
  const raise = Math.max(0, 0.5 - (HEADER_ESTIMATE + mapHeight / 2) / height);

  // Tu zona (sin pedir permiso de ubicación): el mapa se acerca ahí.
  useEffect(() => {
    let active = true;
    locateMe(user?.country, false).then((c) => active && setHere(c));
    return () => {
      active = false;
    };
  }, [user?.country]);

  useEffect(() => {
    if (!here) return undefined;
    let active = true;
    // Nombre de la zona de navegación más cercana, para el subtítulo.
    getWeatherPlaces()
      .then(({ zones }) => {
        const nearest = zones.reduce<{ name: string; km: number } | null>((best, z) => {
          const km = distanceKm(here, { lat: z.latitude, lng: z.longitude });
          return !best || km < best.km ? { name: z.name, km } : best;
        }, null);
        if (active) setZone(nearest && nearest.km < 400 ? nearest.name : null);
      })
      .catch(() => {});
    // Profesional destacado: el más cercano.
    getProfessionals({})
      .then((page) => {
        const withKm = page.results
          .filter((p) => p.latitude && p.longitude)
          .map((p) => ({ ...p, km: distanceKm(here, { lat: Number(p.latitude), lng: Number(p.longitude) }) }));
        withKm.sort((a, b) => a.km - b.km);
        if (active) setFeatured(withKm[0] ?? null);
      })
      .catch(() => {});
    // Viento, corriente y olas de la zona (ahora), para dibujar sobre el mapa.
    getArea(herePlace(here))
      .then((data) => active && setArea(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [here]);

  const available = (k: FieldKind) => (k === 'wind' ? !!area : k === 'waves' ? !!area?.has_waves : !!area?.has_currents);
  const field = useMemo(() => {
    if (!area || !kind) return null;
    const cells = area.points.map((p) => ({ lat: p.lat, lng: p.lng, ...valueOf(p, kind) }));
    return { kind, step: area.step ?? 0.5, cells };
  }, [area, kind]);

  useEffect(() => {
    if (!here) return;
    setPlanetFocus('/services', { lat: here.lat, lng: here.lng, altitude: MAP_ALTITUDE, raise, field });
  }, [here, raise, field]);
  useEffect(() => () => setPlanetFocus('/services', null), []);

  return (
    <Screen>
      {/* Viento / Corriente / Oleaje sobre el mapa (tocar la elegida la apaga). */}
      <View style={styles.tabs} accessibilityRole="tablist">
        {LAYERS.map((layer) => {
          const active = layer === kind;
          const enabled = available(layer);
          return (
            <Pressable
              key={layer}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: !enabled }}
              disabled={!enabled}
              onPress={() => setKind(active ? null : layer)}
              style={[styles.tab, active && styles.tabActive, !enabled && { opacity: 0.4 }]}
            >
              <Text style={[styles.tabText, active && { color: '#fff' }]}>{t(`weather.layers.${layer}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Hueco para ver el mapa (el planeta está detrás, acercado a tu zona). */}
      <View style={{ height: mapHeight }} pointerEvents="none" />

      <View style={styles.panel}>
        {/* Manija: tirando hacia abajo se agranda el mapa; hacia arriba, vuelve. */}
        <View
          onStartShouldSetResponder={() => true}
          onResponderGrant={(e) => setDragFrom({ y: e.nativeEvent.pageY, ratio: mapRatio, moved: false })}
          onResponderMove={(e) => {
            if (!dragFrom) return;
            const dy = e.nativeEvent.pageY - dragFrom.y;
            if (Math.abs(dy) > 4 && !dragFrom.moved) setDragFrom({ ...dragFrom, moved: true });
            setMapRatio(Math.min(MAP_BIG, Math.max(MAP_SMALL, dragFrom.ratio + dy / height)));
          }}
          onResponderRelease={() => {
            // Un toque abre o cierra; al soltar un arrastre se acomoda en el tamaño más cercano.
            if (dragFrom && !dragFrom.moved) setMapRatio(dragFrom.ratio > middle ? MAP_SMALL : MAP_BIG);
            else setMapRatio((r) => (r > middle ? MAP_BIG : MAP_SMALL));
            setDragFrom(null);
          }}
          onResponderTerminate={() => setDragFrom(null)}
          accessibilityRole="button"
          accessibilityLabel={t(mapRatio > MAP_SMALL ? 'calendar.smallerMap' : 'calendar.biggerMap')}
          style={styles.handleArea}
        >
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>{t('services.hubTitle')}</Text>
        {zone ? (
          <View style={styles.zone}>
            <Ionicons name="location-outline" size={18} color={colors.text} />
            <Text style={styles.zoneText}>{zone}</Text>
            <View style={styles.zoneLine} />
          </View>
        ) : null}

        <ServiceSearch here={here} />

        <View style={styles.grid}>
          {CATEGORIES.map(({ key, icon, href }) => (
            <Pressable
              key={key}
              accessibilityRole="link"
              onPress={() => router.push(href)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.tile,
                (pressed || hovered) && { borderColor: colors.primary },
              ]}
            >
              <Ionicons name={icon} size={30} color={ACCENT} />
              <View style={styles.tileDivider} />
              <Text style={styles.tileText}>{t(`services.categories.${key}`)}</Text>
            </Pressable>
          ))}
        </View>

        {featured ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/professionals/[slug]', params: { slug: featured.slug } })}
            style={({ pressed }) => [styles.featured, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.featuredImage}>
              {featured.logo ? (
                <Image source={{ uri: featured.logo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <Ionicons name="construct" size={36} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.featuredTitle} numberOfLines={2}>
                {t('services.featured', { specialty: featured.specialties[0]?.name ?? t('services.professionals'), city: featured.city })}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {featured.name}
              </Text>
              <View style={styles.zone}>
                <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                <Text style={styles.muted}>{[featured.city, featured.country_name].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
            <View style={styles.chevron}>
              <Ionicons name="chevron-forward" size={18} color={ACCENT} />
            </View>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

type Result =
  | { type: 'marina'; item: MarinaSummary; km: number | null }
  | { type: 'professional'; item: ProfessionalSummary; km: number | null };

/** Buscador de servicios náuticos: marinas y profesionales por nombre, ciudad o servicio, los más cercanos primero. */
function ServiceSearch({ here }: { here: Coords | null }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ q: string; items: Result[] } | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return undefined;
    let active = true;
    // Se espera a que deje de escribir.
    const timer = setTimeout(() => {
      const km = (lat: string | null, lng: string | null) => (here && lat && lng ? distanceKm(here, { lat: Number(lat), lng: Number(lng) }) : null);
      Promise.all([getMarinas({ q }).catch(() => null), getProfessionals({ q }).catch(() => null)]).then(([marinas, pros]) => {
        if (!active) return;
        const items: Result[] = [
          ...(marinas?.results ?? []).map((item) => ({ type: 'marina' as const, item, km: km(item.latitude, item.longitude) })),
          ...(pros?.results ?? []).map((item) => ({ type: 'professional' as const, item, km: km(item.latitude, item.longitude) })),
        ];
        items.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
        setResults({ q, items: items.slice(0, 8) });
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, here]);

  const shown = q.length >= 2 && results?.q === q ? results.items : null;
  const searching = q.length >= 2 && results?.q !== q;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('services.search')}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel={t('services.search')}
        />
        {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('services.clearSearch')} onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {shown ? (
        <View style={styles.results}>
          {shown.length ? (
            shown.map((result) => (
              <Pressable
                key={`${result.type}:${result.item.slug}`}
                accessibilityRole="link"
                onPress={() =>
                  result.type === 'marina'
                    ? router.push({ pathname: '/marinas/[slug]', params: { slug: result.item.slug } })
                    : router.push({ pathname: '/professionals/[slug]', params: { slug: result.item.slug } })
                }
                style={({ pressed }) => [styles.result, pressed && { backgroundColor: 'rgba(47,140,255,0.12)' }]}
              >
                <Ionicons name={result.type === 'marina' ? 'boat-outline' : 'construct-outline'} size={20} color={ACCENT} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {result.item.name}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {[
                      result.type === 'marina' ? t(`services.kindOne.${result.item.kind}`) : result.item.specialties[0]?.name,
                      result.item.city,
                      result.km !== null ? `${Math.round(result.km)} km` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))
          ) : (
            <Text style={[styles.muted, { padding: spacing.md }]}>{t('services.noResults')}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const ACCENT = '#2fd4e0';

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.45)',
    backgroundColor: 'rgba(11,23,48,0.85)',
  },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  panel: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(11,23,48,0.92)',
    marginTop: -spacing.lg,
  },
  handleArea: { alignItems: 'center', paddingVertical: spacing.sm },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(230,237,247,0.55)' },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 28, marginTop: -spacing.sm },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zoneText: { color: colors.text, fontStyle: 'italic', letterSpacing: 2, fontSize: 15 },
  zoneLine: { flex: 1, height: 1, backgroundColor: ACCENT, opacity: 0.6, marginLeft: spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(17,33,63,0.85)',
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  results: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(17,33,63,0.95)',
    overflow: 'hidden',
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  resultName: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(17,33,63,0.85)',
  },
  tileDivider: { width: 1, alignSelf: 'stretch', marginVertical: spacing.md, backgroundColor: colors.border },
  tileText: { flex: 1, color: colors.text, fontFamily: fonts.heading, fontSize: 15 },
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(17,33,63,0.85)',
  },
  featuredImage: {
    width: 110,
    height: 90,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  featuredTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 16 },
  muted: { color: colors.textMuted, fontSize: 13 },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
});
