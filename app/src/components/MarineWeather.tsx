import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { AreaForecast, AreaPoint, Forecast } from '@/api/weather';
import { setPlanetFocus } from '@/components/explore/planetFocus';
import { FIELD_SCALES, type FieldKind } from '@/components/globe/globeHtml';
import { colors, fonts, radius, spacing } from '@/theme';
import { weatherIcon } from '@/utils/weatherIcon';

const COMPASS = { es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] };
const compass = (degrees: number, language: string) => COMPASS[language.startsWith('en') ? 'en' : 'es'][Math.round(degrees / 45) % 8];

const LAYERS: { kind: FieldKind; icon: 'flag-outline' | 'swap-horizontal-outline' | 'water-outline' }[] = [
  { kind: 'wind', icon: 'flag-outline' },
  { kind: 'currents', icon: 'swap-horizontal-outline' },
  { kind: 'waves', icon: 'water-outline' },
];

/** Valores de una capa en un punto, para la hora elegida. */
function valuesOf(point: AreaPoint, kind: FieldKind, hour: number) {
  if (kind === 'wind') return { value: point.wind[hour], direction: point.wind_dir[hour], gusts: point.gusts[hour] };
  if (kind === 'waves') return { value: point.wave[hour], direction: point.wave_dir[hour], gusts: null };
  return { value: point.current[hour], direction: point.current_dir[hour], gusts: null };
}

/** El punto con datos más cercano al lugar (en tierra no hay olas ni corriente: se usa el mar más cercano). */
function nearestWithData(area: AreaForecast, kind: FieldKind, hour: number) {
  const { lat, lng } = area.center;
  let best: AreaPoint | null = null;
  let bestDistance = Infinity;
  for (const point of area.points) {
    if (valuesOf(point, kind, hour).value === null) continue;
    const distance = (point.lat - lat) ** 2 + (point.lng - lng) ** 2;
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

/** Hora local del lugar ("14:00"), con la diferencia horaria que informa el pronóstico. */
function localHour(iso: string, offsetSeconds: number) {
  const date = new Date(new Date(iso).getTime() + offsetSeconds * 1000);
  return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
}

/**
 * Clima marino (como el boceto de Miguel): Viento / Corriente / Oleaje sobre el planeta acercado al lugar,
 * el dato de ese punto, la escala de colores, las próximas horas y el pronóstico de 5 días.
 */
export function MarineWeather({ area, forecast, placeName }: { area: AreaForecast; forecast: Forecast; placeName: string }) {
  const { t, i18n } = useTranslation();
  const { height } = useWindowDimensions();
  const [kind, setKind] = useState<FieldKind>('wind');
  const [hour, setHour] = useState(0);
  const available = (k: FieldKind) => (k === 'wind' ? true : k === 'waves' ? area.has_waves : area.has_currents);

  // El planeta se acerca al lugar y dibuja la capa elegida en la hora elegida. Al salir, deja de mostrarla.
  const cells = useMemo(
    () =>
      area.points
        .map((p) => ({ lat: p.lat, lng: p.lng, ...valuesOf(p, kind, hour) }))
        .map(({ lat, lng, value, direction }) => ({ lat, lng, value, direction })),
    [area, kind, hour],
  );
  useEffect(() => {
    setPlanetFocus('/weather', { lat: area.center.lat, lng: area.center.lng, altitude: 0.32, raise: 0.12, field: { kind, step: area.step ?? 0.4, cells } });
  }, [area, kind, cells]);
  useEffect(() => () => setPlanetFocus('/weather', null), []);

  const point = nearestWithData(area, kind, hour);
  const now = point ? valuesOf(point, kind, hour) : null;
  const unit = kind === 'waves' ? 'm' : 'kn';
  const format = (value: number) => (kind === 'wind' ? String(Math.round(value)) : value.toLocaleString(i18n.language, { maximumFractionDigits: 1 }));
  const scale = FIELD_SCALES[kind];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {LAYERS.map((layer) => {
          const active = layer.kind === kind;
          const enabled = available(layer.kind);
          return (
            <Pressable
              key={layer.kind}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: !enabled }}
              disabled={!enabled}
              onPress={() => setKind(layer.kind)}
              style={[styles.tab, active && styles.tabActive, !enabled && { opacity: 0.4 }]}
            >
              <Text style={[styles.tabText, active && { color: '#fff' }]}>{t(`weather.layers.${layer.kind}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Hueco para ver el planeta (que está detrás, acercado al lugar). */}
      <View style={{ height: Math.round(height * 0.4) }} pointerEvents="none" />

      <View style={styles.sheet}>
        {/* El dato del lugar (como el cartelito del boceto) y la escala de colores, en la misma fila. */}
        <View style={styles.sheetTop}>
          <View style={styles.info}>
            <Ionicons name={LAYERS.find((l) => l.kind === kind)!.icon} size={26} color={colors.primary} />
            <View style={styles.infoDivider} />
            <View style={{ flex: 1 }}>
              {now && now.value !== null ? (
                <>
                  <Text style={styles.infoMain}>
                    {now.direction !== null ? `${compass(now.direction, i18n.language)} ` : ''}
                    {format(now.value)} {unit}
                  </Text>
                  {now.gusts !== null ? <Text style={styles.infoSub}>{t('explore.gusts', { value: Math.round(now.gusts) })}</Text> : null}
                </>
              ) : (
                <Text style={styles.infoSub}>{t('weather.noLayerData')}</Text>
              )}
              <View style={styles.infoPlace}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.infoSub} numberOfLines={1}>
                  {placeName}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.legend}>
            <View style={styles.legendBar}>
              {scale.map((step) => (
                <View key={step.value} style={[styles.legendStep, { backgroundColor: step.color }]} />
              ))}
            </View>
            <View style={styles.legendLabels}>
              <Text style={styles.legendText}>
                {format(scale[0].value)} {unit}
              </Text>
              <Text style={styles.legendText}>
                {format(scale[scale.length - 1].value)}+ {unit}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.hours}>
          <View style={styles.hoursLine} />
          {area.times.map((time, index) => {
            const active = index === hour;
            return (
              <Pressable
                key={time}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setHour(index)}
                hitSlop={6}
                style={styles.hour}
              >
                <View style={[styles.hourDot, index <= hour && styles.hourDotPast, active && styles.hourDotActive]} />
                <Text style={[styles.hourText, active && { color: colors.text, fontWeight: '700' }]}>{localHour(time, area.utc_offset_seconds)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sheetTitle}>{t('weather.fiveDays')}</Text>
        <View style={styles.days}>
          {forecast.days.slice(0, 5).map((day, index) => {
            const date = new Date(`${day.date}T12:00:00`);
            const label = index === 0 ? t('weather.today') : date.toLocaleDateString(i18n.language, { weekday: 'short' });
            return (
              <View key={day.date} style={[styles.day, index > 0 && styles.dayDivider]}>
                <Text style={styles.dayLabel}>{label.charAt(0).toUpperCase() + label.slice(1).replace('.', '')}</Text>
                <Ionicons name={weatherIcon(day.weather_code)} size={26} color={colors.text} />
                <Text style={styles.dayTemp}>{day.temp_max === null ? '–' : `${Math.round(day.temp_max)}°`}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

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
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  sheetTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  infoDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  infoMain: { color: colors.text, fontFamily: fonts.display, fontSize: 20 },
  infoSub: { color: colors.textMuted, fontSize: 13 },
  infoPlace: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  sheet: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(11,23,48,0.9)',
  },
  legend: { width: 130, gap: 4, paddingTop: 4 },
  legendBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  legendStep: { flex: 1 },
  legendLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  legendText: { color: colors.textMuted, fontSize: 11 },
  hours: { flexDirection: 'row', justifyContent: 'space-between' },
  hoursLine: { position: 'absolute', left: 14, right: 14, top: 6, height: 2, backgroundColor: colors.border },
  hour: { alignItems: 'center', gap: 6, minWidth: 34 },
  hourDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.textMuted, backgroundColor: colors.background },
  hourDotPast: { borderColor: '#2fd4e0' },
  hourDotActive: { backgroundColor: '#2fd4e0', borderColor: '#2fd4e0', transform: [{ scale: 1.25 }] },
  hourText: { color: colors.textMuted, fontSize: 11 },
  sheetTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 17, marginTop: spacing.xs },
  days: { flexDirection: 'row' },
  day: { flex: 1, alignItems: 'center', gap: 4 },
  dayDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  dayLabel: { color: colors.text, fontSize: 13 },
  dayTemp: { color: colors.text, fontFamily: fonts.heading, fontSize: 17 },
});
