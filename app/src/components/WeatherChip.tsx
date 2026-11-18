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
 * Clima de ahora en tu zona, en una esquina de Explorar. Usa la ubicación del dispositivo si ya diste permiso
 * (no lo pide al abrir la app) y si no, la aproximada (`fallback`: país de la cuenta o zona horaria).
 * Al tocarlo abre Clima con el pronóstico de la semana para tu ubicación.
 */
export function WeatherChip({ fallback }: { fallback: Coords }) {
  const { t } = useTranslation();
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const { lat, lng } = fallback;

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

  const now = forecast?.current;
  const today = forecast?.days[0];
  const temp = now?.temp ?? today?.temp_max ?? null;
  if (temp === null) return null;
  const wind = now?.wind_kn ?? today?.wind_kn ?? null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('explore.weatherNow')}: ${Math.round(temp)}°. ${t('explore.weatherNowHint')}`}
      onPress={() => router.navigate({ pathname: '/weather', params: { place: 'here' } })}
      style={({ pressed }) => [styles.chip, pressed && { borderColor: colors.primary }]}
    >
      <Ionicons name={weatherIcon(now?.weather_code ?? today?.weather_code, now?.is_day === 0)} size={22} color={colors.text} />
      <View>
        <Text style={styles.temp}>{Math.round(temp)}°</Text>
        {wind !== null ? <Text style={styles.wind}>{Math.round(wind)} kn</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(11,23,48,0.85)',
  },
  temp: { color: colors.text, fontFamily: fonts.heading, fontSize: 16, lineHeight: 18 },
  wind: { color: colors.textMuted, fontSize: 11, lineHeight: 13 },
});
