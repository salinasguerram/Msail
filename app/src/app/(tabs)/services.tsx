import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { getProfessionals, type ProfessionalSummary } from '@/api/professionals';
import { getWeatherPlaces } from '@/api/weather';
import { useAuth } from '@/auth/AuthContext';
import { setPlanetFocus } from '@/components/explore/planetFocus';
import { Screen } from '@/components/Screen';
import { colors, fonts, radius, spacing } from '@/theme';
import { distanceKm } from '@/utils/geo';
import { locateMe, type Coords } from '@/utils/myLocation';

type IconName = ComponentProps<typeof Ionicons>['name'];

const CATEGORIES: { key: 'repair' | 'berths' | 'crew' | 'training'; icon: IconName; href: Href }[] = [
  { key: 'repair', icon: 'construct-outline', href: { pathname: '/professionals', params: { specialty: 'rigging' } } },
  { key: 'berths', icon: 'boat-outline', href: '/marinas' },
  { key: 'crew', icon: 'people-outline', href: '/crew' },
  { key: 'training', icon: 'school-outline', href: { pathname: '/msailing', params: { section: 'school' } } },
];

/**
 * Servicios náuticos (como el boceto de Miguel): el planeta acercado a tu zona, cuatro accesos
 * (reparación, amarres, tripulaciones y formación) y el profesional más cercano destacado.
 */
export default function ServicesScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { height } = useWindowDimensions();
  const [here, setHere] = useState<Coords | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [featured, setFeatured] = useState<(ProfessionalSummary & { km: number }) | null>(null);

  // Tu zona (sin pedir permiso de ubicación): el planeta se acerca ahí.
  useEffect(() => {
    let active = true;
    locateMe(user?.country, false).then((c) => active && setHere(c));
    return () => {
      active = false;
    };
  }, [user?.country]);

  useEffect(() => {
    if (!here) return undefined;
    setPlanetFocus('/services', { lat: here.lat, lng: here.lng, altitude: 0.42, raise: 0.3 });
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
    return () => {
      active = false;
    };
  }, [here]);
  useEffect(() => () => setPlanetFocus('/services', null), []);

  return (
    <Screen>
      {/* Hueco para ver el planeta (detrás) acercado a tu zona. */}
      <View style={{ height: Math.round(height * 0.24) }} pointerEvents="none" />
      <View style={styles.panel}>
        <Text style={styles.title}>{t('services.hubTitle')}</Text>
        {zone ? (
          <View style={styles.zone}>
            <Ionicons name="location-outline" size={18} color={colors.text} />
            <Text style={styles.zoneText}>{zone}</Text>
            <View style={styles.zoneLine} />
          </View>
        ) : null}

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
              <Ionicons name={icon} size={30} color="#2fd4e0" />
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
              <Text style={styles.featuredName} numberOfLines={1}>
                {featured.name}
              </Text>
              <View style={styles.zone}>
                <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                <Text style={styles.featuredPlace}>{[featured.city, featured.country_name].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
            <View style={styles.chevron}>
              <Ionicons name="chevron-forward" size={18} color="#2fd4e0" />
            </View>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(11,23,48,0.9)',
  },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 28 },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zoneText: { color: colors.text, fontStyle: 'italic', letterSpacing: 2, fontSize: 15 },
  zoneLine: { flex: 1, height: 1, backgroundColor: '#2fd4e0', opacity: 0.6, marginLeft: spacing.sm },
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
  featuredName: { color: colors.textMuted, fontSize: 13 },
  featuredPlace: { color: colors.textMuted, fontSize: 13 },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2fd4e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
});
