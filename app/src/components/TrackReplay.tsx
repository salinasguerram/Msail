import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { RaceTrack } from '@/api/events';
import { colors, fonts, radius, spacing } from '@/theme';

const SPEEDS = [10, 30, 60] as const;
const TICK_MS = 50;

type Boat = RaceTrack['boats'][number] & {
  times: number[];
  xs: number[];
  ys: number[];
  /** Recorrido completo en coordenadas de pantalla ("x,y x,y ..."). */
  full: string;
  finish: number;
};

/** Último índice con tiempo <= t (búsqueda binaria). */
function indexAt(times: number[], t: number) {
  let lo = 0;
  let hi = times.length - 1;
  if (t <= times[0]) return 0;
  if (t >= times[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Posición del barco en el tiempo t (interpolada entre dos puntos del GPS). */
function positionAt(boat: Boat, t: number) {
  const i = indexAt(boat.times, t);
  const j = Math.min(i + 1, boat.times.length - 1);
  const span = boat.times[j] - boat.times[i];
  const f = span > 0 ? Math.min(1, Math.max(0, (t - boat.times[i]) / span)) : 0;
  return { i, x: boat.xs[i] + (boat.xs[j] - boat.xs[i]) * f, y: boat.ys[i] + (boat.ys[j] - boat.ys[i]) * f };
}

/** Velocidad en nudos en los últimos 30 s antes de t. */
function speedAt(boat: Boat, t: number) {
  const i = indexAt(boat.times, t);
  const j = indexAt(boat.times, t - 30);
  if (i === j) return 0;
  let nm = 0;
  for (let k = j; k < i; k++) {
    const [, la1, lo1] = boat.points[k];
    const [, la2, lo2] = boat.points[k + 1];
    nm += Math.hypot((la2 - la1) * 60, (lo2 - lo1) * 60 * Math.cos((la1 * Math.PI) / 180));
  }
  const hours = (boat.times[i] - boat.times[j]) / 3600;
  return hours > 0 ? nm / hours : 0;
}

/** Distancia navegada hasta t (millas): para ordenar a los que todavía no llegaron. */
function sailedAt(boat: Boat, t: number) {
  const i = indexAt(boat.times, t);
  let nm = 0;
  for (let k = 0; k < i; k++) {
    const [, la1, lo1] = boat.points[k];
    const [, la2, lo2] = boat.points[k + 1];
    nm += Math.hypot((la2 - la1) * 60, (lo2 - lo1) * 60 * Math.cos((la1 * Math.PI) / 180));
  }
  return nm;
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
};

/**
 * Repetición de una carrera con el GPS de cada barco (como Telltale): recorridos de colores, posición de cada barco,
 * reloj, velocidad y orden de llegada. Se puede pausar, adelantar (x10, x30, x60) y saltar a cualquier momento.
 */
export function TrackReplay({ track }: { track: RaceTrack }) {
  const { t, i18n } = useTranslation();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const width = Math.min(screenW - spacing.lg * 2, 720);
  const height = Math.round(Math.min(screenH * 0.55, width * 1.1));
  const start = track.start ?? 0;
  const end = track.end ?? 0;
  const [time, setTime] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(30);
  const [barWidth, setBarWidth] = useState(1);

  // Proyección plana (alcanza para las pocas millas de una carrera), ajustada al tablero con un margen.
  const boats = useMemo<Boat[]>(() => {
    const all = track.boats.flatMap((b) => b.points);
    if (!all.length) return [];
    const lats = all.map((p) => p[1]);
    const lngs = all.map((p) => p[2]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = Math.max((maxLng - minLng) * k, 1e-6);
    const spanY = Math.max(maxLat - minLat, 1e-6);
    const pad = 28;
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offX = (width - spanX * scale) / 2;
    const offY = (height - spanY * scale) / 2;
    return track.boats.map((b) => {
      const xs = b.points.map((p) => offX + (p[2] - minLng) * k * scale);
      const ys = b.points.map((p) => offY + (maxLat - p[1]) * scale);
      return {
        ...b,
        times: b.points.map((p) => p[0]),
        xs,
        ys,
        full: xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' '),
        finish: b.points[b.points.length - 1][0],
      };
    });
  }, [track, width, height]);

  // Reproducción: avanza `speed` segundos de carrera por cada segundo real.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      setTime((current) => {
        const next = current + (speed * TICK_MS) / 1000;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, speed, end]);

  const positions = boats.map((boat) => ({ boat, ...positionAt(boat, time) }));
  // Orden: primero los que llegaron (por hora de llegada); después, los que más navegaron.
  const ranking = [...boats]
    .map((boat) => ({ boat, finished: time >= boat.finish, sailed: sailedAt(boat, time), speed: speedAt(boat, time) }))
    .sort((a, b) => (a.finished && b.finished ? a.boat.finish - b.boat.finish : a.finished ? -1 : b.finished ? 1 : b.sailed - a.sailed));
  const finishedCount = ranking.filter((r) => r.finished).length;
  const progress = end > start ? (time - start) / (end - start) : 0;
  const startTime = new Date(start * 1000).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  const seek = (x: number) => setTime(start + Math.min(1, Math.max(0, x / barWidth)) * (end - start));

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.board}>
        <Svg width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} fill="#0b2340" />
          {/* Recorrido completo, tenue. */}
          {boats.map((boat) => (
            <Polyline key={`full-${boat.id}`} points={boat.full} fill="none" stroke={boat.color} strokeOpacity={0.14} strokeWidth={1} />
          ))}
          {/* Lo navegado hasta ahora, con el color del barco. */}
          {positions.map(({ boat, i, x, y }) => {
            const done = boat.xs
              .slice(0, i + 1)
              .map((px, n) => `${px.toFixed(1)},${boat.ys[n].toFixed(1)}`)
              .concat(`${x.toFixed(1)},${y.toFixed(1)}`)
              .join(' ');
            return <Polyline key={`done-${boat.id}`} points={done} fill="none" stroke={boat.color} strokeOpacity={0.9} strokeWidth={1.6} />;
          })}
          {positions.map(({ boat, x, y }) => (
            <G key={`boat-${boat.id}`}>
              <Circle cx={x} cy={y} r={4.5} fill={boat.color} stroke="#0b2340" strokeWidth={1.5} />
              <SvgText x={x + 7} y={y + 4} fill="#e6edf7" fontSize={10} fontWeight="700">
                {boat.boat_name}
              </SvgText>
            </G>
          ))}
        </Svg>
        <View style={styles.clock} pointerEvents="none">
          <Text style={styles.clockMain}>{clock(time - start)}</Text>
          <Text style={styles.clockSub}>{t('track.startedAt', { time: startTime })}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(playing ? 'track.pause' : 'track.play')}
          onPress={() => {
            if (!playing && time >= end) setTime(start);
            setPlaying((p) => !p);
          }}
          style={styles.play}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={22} color="#fff" />
        </Pressable>
        <View
          style={styles.bar}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(e) => seek(e.nativeEvent.locationX)}
          onResponderMove={(e) => seek(e.nativeEvent.locationX)}
          accessibilityRole="adjustable"
          accessibilityLabel={t('track.timeline')}
        >
          <View style={styles.barTrack} />
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
          <View style={[styles.barKnob, { left: `${progress * 100}%` }]} />
        </View>
      </View>
      <View style={styles.speeds}>
        {SPEEDS.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: speed === value }}
            onPress={() => setSpeed(value)}
            style={[styles.speed, speed === value && styles.speedOn]}
          >
            <Text style={[styles.speedText, speed === value && { color: '#fff' }]}>x{value}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.results}>
        <Text style={styles.resultsTitle}>{t(finishedCount === boats.length ? 'track.finalResults' : 'track.liveResults')}</Text>
        <View style={styles.row}>
          <Text style={[styles.head, { flex: 1 }]}>{t('track.boat')}</Text>
          <Text style={[styles.head, styles.num]}>{t('track.now')}</Text>
          <Text style={[styles.head, styles.num]}>{t('track.maxSpeed')}</Text>
        </View>
        {ranking.map(({ boat, finished, speed: now }, index) => (
          <View key={boat.id} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: boat.color }]} />
            <Text style={styles.pos}>{String(index + 1).padStart(2, '0')}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {boat.boat_name}
              {boat.sail_number ? <Text style={styles.sail}> {boat.sail_number}</Text> : null}
            </Text>
            <Text style={[styles.value, styles.num]}>{finished ? '🏁' : `${now.toFixed(1)} kn`}</Text>
            <Text style={[styles.value, styles.num]}>{boat.max_speed_kn.toFixed(1)} kn</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(120,160,230,0.35)' },
  clock: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(5,11,24,0.75)',
  },
  clockMain: { color: '#facc15', fontFamily: fonts.display, fontSize: 22 },
  clockSub: { color: colors.textMuted, fontSize: 11 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  play: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#2fb8e0', alignItems: 'center', justifyContent: 'center' },
  bar: { flex: 1, height: 30, justifyContent: 'center' },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  barFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: '#2fd4e0' },
  barKnob: {
    position: 'absolute',
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: '#2fd4e0',
    borderWidth: 2,
    borderColor: '#fff',
  },
  speeds: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  speed: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  speedOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  speedText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  results: {
    gap: 6,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    backgroundColor: 'rgba(11,23,48,0.9)',
  },
  resultsTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 18, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  head: { color: colors.textMuted, fontSize: 12 },
  swatch: { width: 22, height: 4, borderRadius: 2 },
  pos: { color: colors.textMuted, fontSize: 13, width: 22 },
  name: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 15 },
  sail: { color: colors.textMuted, fontWeight: '400', fontSize: 12 },
  value: { color: colors.text, fontSize: 14 },
  num: { width: 66, textAlign: 'right' },
});
