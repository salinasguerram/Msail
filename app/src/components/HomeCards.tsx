import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors, fonts, radius, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Tarjeta grande de la home (web ancha): ilustración arriba y barra con ícono, título y flecha abajo. */
export function HomeCard({
  icon,
  title,
  subtitle,
  art,
  onPress,
  height = 210,
}: {
  icon: IconName;
  title: string;
  subtitle?: string | null;
  art: ReactNode;
  onPress: () => void;
  height?: number;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        styles.card,
        { height },
        (hovered || pressed) && { borderColor: colors.primary, transform: [{ translateY: -2 }] },
      ]}
    >
      <View style={StyleSheet.absoluteFill}>{art}</View>
      <View style={styles.footer}>
        <Ionicons name={icon} size={22} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.text} />
      </View>
    </Pressable>
  );
}

/** Velero visto de costado: casco, mástil, mayor y foque. (x, y) es el centro del casco sobre el agua. */
function Boat({ x, y, s, shade = 1 }: { x: number; y: number; s: number; shade?: number }) {
  const sail = shade === 1 ? '#f7f9fc' : '#dfe7f1';
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M-6 -4 C 4 -48, 14 -78, 16 -96 L16 -4 Z" fill="url(#jib)" opacity={0.95} />
      <Path d="M19 -100 C 32 -70, 42 -36, 48 -6 L19 -6 Z" fill={sail} />
      <Path d="M18 -102 L18 -2" stroke="#3a4a5e" strokeWidth={1.2} />
      <Path d="M-14 -2 L54 -2 L46 7 L-6 7 Z" fill="#f2f5f9" />
      <Path d="M-6 7 L46 7" stroke="#8aa0b8" strokeWidth={1} />
    </G>
  );
}

/** Ilustración de regata: cielo de día, mar y veleros (en lugar de una foto). */
export function RegattaArt() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 210" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3f7fc6" />
          <Stop offset="1" stopColor="#c4dcf2" />
        </LinearGradient>
        <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2a6db5" />
          <Stop offset="1" stopColor="#0b2c5e" />
        </LinearGradient>
        <LinearGradient id="jib" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#cfdbe8" />
        </LinearGradient>
      </Defs>
      <Rect width="400" height="120" fill="url(#sky)" />
      <G fill="#ffffff" opacity={0.55}>
        <Ellipse cx="70" cy="40" rx="46" ry="9" />
        <Ellipse cx="105" cy="34" rx="30" ry="8" />
        <Ellipse cx="300" cy="28" rx="52" ry="8" />
        <Ellipse cx="350" cy="58" rx="40" ry="6" />
        <Ellipse cx="190" cy="66" rx="34" ry="5" />
      </G>
      <Rect y="118" width="400" height="92" fill="url(#sea)" />
      <G stroke="#ffffff" strokeWidth={1.2} opacity={0.22} fill="none">
        <Path d="M0 132 C 40 128, 80 136, 120 131 S 200 128, 240 133 S 330 129, 400 132" />
        <Path d="M0 152 C 50 146, 90 158, 150 151 S 250 146, 300 154 S 370 149, 400 152" />
        <Path d="M0 176 C 60 168, 120 182, 190 174 S 300 168, 400 178" />
      </G>
      <Boat x={46} y={124} s={0.32} shade={0} />
      <Boat x={92} y={126} s={0.42} />
      <Boat x={150} y={124} s={0.3} shade={0} />
      <Boat x={346} y={126} s={0.4} />
      <Boat x={384} y={124} s={0.28} shade={0} />
      <Boat x={232} y={160} s={1.05} />
      <Path d="M210 170 C 230 166, 270 166, 300 171" stroke="#ffffff" strokeWidth={2} opacity={0.5} fill="none" />
    </Svg>
  );
}

const WIND_COLORS = ['#1f5fe0', '#2a8cff', '#2fc4e0', '#45d6a0', '#8fe06a', '#e2e25a'];

/** Ilustración de mapa de viento: líneas de corriente de colores y un remolino, sobre el océano. */
export function WindArt() {
  const lines: ReactNode[] = [];
  for (let i = 0; i < 16; i++) {
    const y = 8 + i * 13;
    const bend = 10 + (i % 4) * 6;
    // Más fuerte (verde/amarillo) cerca de la borrasca, más suave (azul) lejos.
    const strength = 1 - Math.abs(i - 7) / 8;
    const color = WIND_COLORS[Math.max(0, Math.min(WIND_COLORS.length - 1, Math.round(strength * (WIND_COLORS.length - 1))))];
    lines.push(
      <Path
        key={i}
        d={`M-20 ${y} C 60 ${y - bend}, 120 ${y + bend}, 200 ${y} S 330 ${y - bend}, 420 ${y + bend / 2}`}
        stroke={color}
        strokeWidth={1.6}
        opacity={0.75}
        fill="none"
        strokeDasharray={i % 3 === 0 ? '14 6' : undefined}
      />,
    );
  }
  // Remolino (borrasca): espiral alrededor de (300, 95).
  let spiral = '';
  for (let a = 0; a <= Math.PI * 6; a += 0.2) {
    const r = 4 + a * 7;
    const x = 300 + r * Math.cos(a);
    const y = 95 + r * 0.8 * Math.sin(a);
    spiral += `${a === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 210" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="ocean" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0b2f7a" />
          <Stop offset="1" stopColor="#06184a" />
        </LinearGradient>
        <LinearGradient id="storm" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#e8e45a" />
          <Stop offset="0.5" stopColor="#6fdc6a" />
          <Stop offset="1" stopColor="#2fc4e0" />
        </LinearGradient>
      </Defs>
      <Rect width="400" height="210" fill="url(#ocean)" />
      {/* Costas sugeridas a los costados. */}
      <Path d="M0 0 L70 0 C 60 30, 40 40, 48 70 C 54 92, 30 110, 18 140 L0 150 Z" fill="#2f7d45" opacity={0.85} />
      <Path d="M400 120 C 380 140, 372 170, 386 210 L400 210 Z" fill="#3c8a4c" opacity={0.85} />
      {lines}
      <Path d={spiral} stroke="url(#storm)" strokeWidth={3} fill="none" opacity={0.9} />
      <Circle cx={300} cy={95} r={6} fill="#e8e45a" opacity={0.9} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,160,230,0.35)',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(8,16,36,0.88)',
  },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 17 },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
});
