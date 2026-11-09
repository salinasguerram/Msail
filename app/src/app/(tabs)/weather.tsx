import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getForecast, getWeatherPlaces, type Forecast, type ForecastDay, type WeatherPlace } from '@/api/weather';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SelectField, type SelectOption } from '@/components/SelectField';
import { colors, radius, spacing, typography } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Ícono según el código WMO del estado del cielo. */
function weatherIcon(code: number | null): IconName {
  if (code === null) return 'help-circle-outline';
  if (code === 0) return 'sunny-outline';
  if (code <= 2) return 'partly-sunny-outline';
  if (code <= 48) return 'cloudy-outline';
  if (code >= 95) return 'thunderstorm-outline';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow-outline';
  return 'rainy-outline';
}

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

/** Pronóstico semanal por sede de regata o zona de navegación. Acepta ?place=event:<slug> desde la página de una regata. */
export default function WeatherScreen() {
  const { t } = useTranslation();
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
    getWeatherPlaces()
      .then((data) => {
        setPlaces(data);
        // Sin lugar elegido: la próxima regata o, si no hay, la primera zona.
        setPlace((current) => current ?? data.events[0]?.id ?? data.zones[0]?.id ?? null);
      })
      .catch(setPlacesError);
  }, []);

  const options = useMemo<SelectOption[]>(() => {
    if (!places) return [];
    return [
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
      {placesError ? <Text style={{ color: colors.danger }}>{errorMessage(placesError, t)}</Text> : null}
      {place ? <ForecastView key={place} place={place} /> : !places && !placesError ? <ActivityIndicator color={colors.primary} /> : null}
    </Screen>
  );
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
        <Text style={styles.placeName}>{forecast.place.name}</Text>
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
