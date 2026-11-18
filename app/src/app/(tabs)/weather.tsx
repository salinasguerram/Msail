import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getCountries } from '@/api/catalogs';
import { getMyProfile } from '@/api/profiles';
import { getForecast, getWeatherPlaces, type Forecast, type ForecastDay, type WeatherPlace } from '@/api/weather';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SelectField, type SelectOption } from '@/components/SelectField';
import { colors, radius, spacing, typography } from '@/theme';
import { distanceKm } from '@/utils/geo';
import { approximateLocation } from '@/utils/homeLocation';
import { deviceLocation, herePlace, type Coords } from '@/utils/myLocation';
import { weatherIcon } from '@/utils/weatherIcon';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const COMPASS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Color del viento: suave, navegable, fuerte, muy fuerte. */
function windColor(knots: number | null) {
  if (knots === null) return colors.textMuted;
  if (knots < 10) return colors.success;
  if (knots < 20) return colors.primary;
  if (knots < 28) return colors.warning;
  return colors.danger;
}

const round = (value: number | null) => (value === null ? '–' : String(Math.round(value)));

/**
 * Lugar con el que abre la pestaña, según la ubicación del perfil:
 * 1. la región náutica del perfil de navegante (si es una de las zonas con pronóstico);
 * 2. la zona más cercana al país de la cuenta o, sin sesión, a la ubicación aproximada (zona horaria).
 */
/** Tu ubicación: la del dispositivo (pide permiso) o, si no se puede, la aproximada (país de la cuenta o zona horaria). */
async function resolveHere(userCountry: string | null | undefined): Promise<Coords> {
  const precise = await deviceLocation(true);
  if (precise) return precise;
  let country = null;
  if (userCountry) {
    const list = await getCountries().catch(() => []);
    country = list.find((c) => c.iso_code === userCountry) ?? null;
  }
  return approximateLocation(country);
}

async function defaultPlace(zones: WeatherPlace[], userCountry: string | null | undefined, signedIn: boolean) {
  if (!zones.length) return null;
  if (signedIn) {
    const profile = await getMyProfile().catch(() => null);
    const regionZone = profile?.region ? zones.find((z) => z.id === `zone:${profile.region!.id}`) : undefined;
    if (regionZone) return regionZone.id;
  }
  let country = null;
  if (userCountry) {
    const list = await getCountries().catch(() => []);
    country = list.find((c) => c.iso_code === userCountry) ?? null;
  }
  const here = approximateLocation(country);
  const nearest = zones.reduce((best, zone) =>
    distanceKm(here, { lat: zone.latitude, lng: zone.longitude }) < distanceKm(here, { lat: best.latitude, lng: best.longitude }) ? zone : best,
  );
  return nearest.id;
}

/** Pronóstico semanal por sede de regata o zona de navegación. Acepta ?place=event:<slug> desde la página de una regata. */
export default function WeatherScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ place?: string }>();
  const [places, setPlaces] = useState<{ events: WeatherPlace[]; zones: WeatherPlace[] } | null>(null);
  const [place, setPlace] = useState<string | null>(params.place ?? null);
  const [placesError, setPlacesError] = useState<unknown>(null);

  // Si se vuelve a entrar desde otra regata, se muestra esa.
  const [lastParam, setLastParam] = useState(params.place);
  if (params.place !== lastParam) {
    setLastParam(params.place);
    if (params.place) setPlace(params.place);
  }

  useEffect(() => {
    let active = true;
    getWeatherPlaces()
      .then(async (data) => {
        if (!active) return;
        setPlaces(data);
        // Sin lugar elegido (no se vino desde una regata): la zona del perfil o la más cercana.
        const fallback = (await defaultPlace(data.zones, user?.country, !!user)) ?? data.events[0]?.id ?? null;
        if (active) setPlace((current) => current ?? fallback);
      })
      .catch((e) => active && setPlacesError(e));
    return () => {
      active = false;
    };
  }, [user]);

  const options = useMemo<SelectOption[]>(() => {
    if (!places) return [];
    return [
      { value: 'here', label: t('weather.here'), hint: t('weather.hereHint') },
      ...places.events.map((p) => ({ value: p.id, label: p.name, hint: `${t('weather.venue')} · ${p.subtitle}` })),
      ...places.zones.map((p) => ({ value: p.id, label: p.name, hint: `${t('weather.zone')} · ${p.subtitle}` })),
    ];
  }, [places, t]);

  return (
    <Screen>
      <SelectField
        label={t('weather.place')}
        value={place}
        options={options}
        onChange={(v) => {
          if (!v) return;
          setPlace(v);
          if (params.place) router.setParams({ place: undefined });
        }}
        placeholder={t('weather.pickPlace')}
      />
      <Button
        title={t('planet.wind.openMap')}
        variant="secondary"
        onPress={() => router.navigate({ pathname: '/', params: { wind: '1' } })}
      />
      {placesError ? <Text style={{ color: colors.danger }}>{errorMessage(placesError, t)}</Text> : null}
      {place === 'here' ? (
        <HereForecast userCountry={user?.country} />
      ) : place ? (
        <ForecastView key={place} place={place} />
      ) : !places && !placesError ? (
        <ActivityIndicator color={colors.primary} />
      ) : null}
    </Screen>
  );
}

/** Pronóstico para tu ubicación (desde el clima de la esquina de Explorar o eligiendo "Mi ubicación"). */
function HereForecast({ userCountry }: { userCountry: string | null | undefined }) {
  const [coords, setCoords] = useState<Coords | null>(null);
  useEffect(() => {
    let active = true;
    resolveHere(userCountry).then((c) => active && setCoords(c));
    return () => {
      active = false;
    };
  }, [userCountry]);
  if (!coords) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />;
  const place = herePlace(coords);
  return <ForecastView key={place} place={place} />;
}

function ForecastView({ place }: { place: string }) {
  const { t, i18n } = useTranslation();
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fetchForecast = useCallback(() => getForecast(place).then(setForecast).catch(setError), [place]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  if (!forecast) {
    return error ? (
      <Card style={{ alignItems: 'center' }}>
        <Text style={[typography.body, { textAlign: 'center' }]}>{errorMessage(error, t)}</Text>
        <Button
          title={t('profile.retry')}
          variant="ghost"
          onPress={() => {
            setError(null);
            fetchForecast();
          }}
        />
      </Card>
    ) : (
      <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
    );
  }

  const updated = new Date(forecast.updated_at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <Card style={{ gap: 4 }}>
        <Text style={styles.placeName}>{forecast.place.kind === 'here' ? t('weather.here') : forecast.place.name}</Text>
        <Text style={typography.caption}>
          {[forecast.place.subtitle, forecast.place.kind === 'event' ? forecast.place.country_name : null].filter(Boolean).join(' · ')}
        </Text>
        <Text style={typography.caption}>{t('weather.updated', { time: updated })}</Text>
      </Card>

      {forecast.days.map((day, index) => (
        <DayRow key={day.date} day={day} today={index === 0} hasWaves={forecast.has_waves} />
      ))}

      <View style={styles.legend}>
        {[
          [colors.success, t('weather.legend.light')],
          [colors.primary, t('weather.legend.moderate')],
          [colors.warning, t('weather.legend.strong')],
          [colors.danger, t('weather.legend.gale')],
        ].map(([color, label]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={typography.caption}>{label}</Text>
          </View>
        ))}
      </View>

      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(forecast.source.url)} hitSlop={6}>
        <Text style={[typography.caption, { textAlign: 'center' }]}>
          {t('weather.source', { name: forecast.source.name, license: forecast.source.license })}
        </Text>
      </Pressable>
    </>
  );
}

function DayRow({ day, today, hasWaves }: { day: ForecastDay; today: boolean; hasWaves: boolean }) {
  const { t, i18n } = useTranslation();
  const date = new Date(`${day.date}T12:00:00`);
  const weekday = today ? t('weather.today') : date.toLocaleDateString(i18n.language, { weekday: 'long' });
  const compass = i18n.language.startsWith('en') ? COMPASS_EN : COMPASS;
  const from = day.wind_direction === null ? '' : compass[Math.round(day.wind_direction / 45) % 8];
  const color = windColor(day.gusts_kn ?? day.wind_kn);

  return (
    <View style={styles.day}>
      <View style={styles.dayHeader}>
        <Ionicons name={weatherIcon(day.weather_code)} size={26} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { fontWeight: '700' }]}>{weekday.charAt(0).toUpperCase() + weekday.slice(1)}</Text>
          <Text style={typography.caption}>{date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}</Text>
        </View>
        <Text style={styles.temps}>
          {round(day.temp_max)}° <Text style={{ color: colors.textMuted }}>/ {round(day.temp_min)}°</Text>
        </Text>
      </View>

      <View style={styles.metrics}>
        <View style={[styles.metric, { borderColor: color }]}>
          <Text style={typography.caption}>{t('weather.wind')}</Text>
          <View style={styles.windValue}>
            {day.wind_direction !== null ? (
              // La flecha apunta hacia donde sopla (el viento viene del lado opuesto).
              <Ionicons name="arrow-up" size={18} color={color} style={{ transform: [{ rotate: `${(day.wind_direction + 180) % 360}deg` }] }} />
            ) : null}
            <Text style={[styles.big, { color }]}>{round(day.wind_kn)}</Text>
            <Text style={typography.caption}>kn</Text>
          </View>
          <Text style={typography.caption}>{t('weather.gusts', { value: round(day.gusts_kn), from })}</Text>
        </View>

        <View style={styles.metric}>
          <Text style={typography.caption}>{t('weather.rain')}</Text>
          <Text style={styles.big}>{day.rain_mm === null ? '–' : `${Math.round(day.rain_mm * 10) / 10}`}</Text>
          <Text style={typography.caption}>{t('weather.rainDetail', { probability: round(day.rain_probability) })}</Text>
        </View>

        {hasWaves ? (
          <View style={styles.metric}>
            <Text style={typography.caption}>{t('weather.waves')}</Text>
            <Text style={styles.big}>{day.wave_m === null ? '–' : `${Math.round(day.wave_m * 10) / 10}`}</Text>
            <Text style={typography.caption}>
              {day.wave_period_s === null ? t('weather.noData') : t('weather.period', { value: round(day.wave_period_s) })}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeName: { ...typography.title, fontSize: 22, lineHeight: 28 },
  day: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  temps: { color: colors.text, fontWeight: '700', fontSize: 16 },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  windValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  big: { color: colors.text, fontSize: 22, fontWeight: '800' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
