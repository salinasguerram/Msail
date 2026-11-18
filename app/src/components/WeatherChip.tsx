import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getForecast, type Forecast } from '@/api/weather';
import { colors, fonts, radius, spacing } from '@/theme';
import { deviceLocation, herePlace, type Coords } from '@/utils/myLocation';
import { weatherIcon } from '@/utils/weatherIcon';

/**
 * Clima de ahora en tu zona, en una esquina de Explorar, unido al botón del mapa de viento (una sola pastilla:
 * a la izquierda el tiempo, a la derecha "Viento"). Usa la ubicación del dispositivo si ya diste permiso
 * (no lo pide al abrir la app) y si no, la aproximada (`fallback`: país de la cuenta o zona horaria).
 * Al tocarlo abre Clima con el pronóstico de la semana para tu ubicación.
 */
/** Pronóstico de tu ubicación (la del dispositivo si ya diste permiso; si no, la aproximada). */
function useLocalForecast({ lat, lng }: Coords) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  useEffect(() => {
    let active = true;
    deviceLocation(false)
      .then((precise) => getForecast(herePlace(precise ?? { lat, lng })))
      .then((data) => active && setForecast(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [lat, lng]);
  return forecast;
}

const COMPASS = { es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] };
/** De dónde viene el viento, en puntos cardinales (ej. "SO"). */
const compass = (degrees: number, language: string) => COMPASS[language.startsWith('en') ? 'en' : 'es'][Math.round(degrees / 45) % 8];

const openForecast = () => router.navigate({ pathname: '/weather', params: { place: 'here' } });

/**
 * "Clima de hoy" (celular, como el boceto de Miguel): ícono, lugar, temperatura, viento con dirección y rachas.
 * Al tocarla abre Clima con el pronóstico de tu ubicación.
 */
export function WeatherCard({ fallback }: { fallback: Coords }) {
  const { t, i18n } = useTranslation();
  const forecast = useLocalForecast(fallback);
  const now = forecast?.current;
  const today = forecast?.days[0];
  const temp = now?.temp ?? today?.temp_max ?? null;
  if (!forecast || temp === null) return null;
  const wind = now?.wind_kn ?? today?.wind_kn ?? null;
  const direction = now?.wind_direction ?? today?.wind_direction ?? null;
  const gusts = now?.gusts_kn ?? today?.gusts_kn ?? null;
  // Zona de referencia más cercana (ej. "Río de la Plata"); si no hay, "Tu ubicación".
  const place = forecast.place.subtitle.split(' · ')[0] || t('weather.here');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('explore.weatherToday')}, ${place}: ${Math.round(temp)}°. ${t('explore.weatherNowHint')}`}
      onPress={openForecast}
      style={({ pressed }) => [styles.card, pressed && { borderColor: colors.primary }]}
    >
      <Ionicons name={weatherIcon(now?.weather_code ?? today?.weather_code, now?.is_day === 0)} size={34} color={colors.text} />
      <View style={styles.cardDivider} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.cardTitle}>{t('explore.weatherToday')}</Text>
        <Text style={styles.cardPlace} numberOfLines={1}>
          {place}
        </Text>
      </View>
      <View style={styles.cardDivider} />
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.cardTemp}>{Math.round(temp)} °C</Text>
        {wind !== null ? (
          <Text style={styles.cardWind}>
            {direction !== null ? `${compass(direction, i18n.language)} ` : ''}
            {Math.round(wind)} kn{gusts !== null ? ` · ${t('explore.gusts', { value: Math.round(gusts) })}` : ''}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Web ancha: el clima de ahora y el botón del viento en una pastilla, en una esquina del planeta. */
export function WeatherChip({ fallback, windOn, onToggleWind }: { fallback: Coords; windOn: boolean; onToggleWind: () => void }) {
  const { t } = useTranslation();
  const forecast = useLocalForecast(fallback);

  const now = forecast?.current;
  const today = forecast?.days[0];
  const temp = now?.temp ?? today?.temp_max ?? null;
  const wind = now?.wind_kn ?? today?.wind_kn ?? null;

  return (
    <View style={styles.pill}>
      {temp !== null ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('explore.weatherNow')}: ${Math.round(temp)}°. ${t('explore.weatherNowHint')}`}
            onPress={openForecast}
            style={({ pressed }) => [styles.part, pressed && styles.pressed]}
          >
            <Ionicons name={weatherIcon(now?.weather_code ?? today?.weather_code, now?.is_day === 0)} size={22} color={colors.text} />
            <View>
              <Text style={styles.temp}>{Math.round(temp)}°</Text>
              {wind !== null ? <Text style={styles.small}>{Math.round(wind)} kn</Text> : null}
            </View>
          </Pressable>
          <View style={styles.divider} />
        </>
      ) : null}
      {/* Mapa de viento sobre el planeta: prendido se ve en azul. */}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: windOn }}
        accessibilityLabel={t('planet.wind.button')}
        onPress={onToggleWind}
        style={({ pressed }) => [styles.part, styles.windPart, windOn && styles.windOn, pressed && styles.pressed]}
      >
        <Ionicons name="flag-outline" size={18} color={windOn ? '#fff' : colors.text} />
        <Text style={[styles.small, styles.windText, windOn && { color: '#fff' }]}>{t('planet.wind.button')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(11,23,48,0.88)',
  },
  cardDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  cardTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 16 },
  cardPlace: { color: colors.textMuted, fontSize: 13 },
  cardTemp: { color: colors.text, fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  cardWind: { color: colors.textMuted, fontSize: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(11,23,48,0.85)',
    overflow: 'hidden',
  },
  part: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pressed: { backgroundColor: 'rgba(47,140,255,0.18)' },
  divider: { width: 1, marginVertical: 8, backgroundColor: colors.border },
  windPart: { flexDirection: 'column', gap: 1, paddingHorizontal: spacing.md },
  windOn: { backgroundColor: colors.primary },
  windText: { color: colors.text, fontWeight: '700' },
  temp: { color: colors.text, fontFamily: fonts.heading, fontSize: 16, lineHeight: 18 },
  small: { color: colors.textMuted, fontSize: 11, lineHeight: 13 },
});
