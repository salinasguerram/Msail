import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, fonts, spacing } from '@/theme';

/** Las dos velas del logo de MSAIL (azul eléctrico con degradé). `size` es el alto. */
export function SailsMark({ size = 24 }: { size?: number }) {
  return (
    <Svg width={(size * 80) / 64} height={size} viewBox="0 0 80 64">
      <Defs>
        <LinearGradient id="sailBack" x1="0.8" y1="0" x2="0.1" y2="1">
          <Stop offset="0" stopColor="#3ab4ff" />
          <Stop offset="1" stopColor="#0b5fe6" />
        </LinearGradient>
        <LinearGradient id="sailFront" x1="0.85" y1="0" x2="0.2" y2="1">
          <Stop offset="0" stopColor="#4cc0ff" />
          <Stop offset="1" stopColor="#1069f0" />
        </LinearGradient>
      </Defs>
      {/* Vela de atrás (más chica) y vela de adelante; el borde izquierdo de cada una es una curva tipo barrido. */}
      <Path d="M0 62 C 18 54, 30 34, 33 3 C 37 22, 40 38, 45 52 C 30 54, 15 57, 0 62 Z" fill="url(#sailBack)" />
      <Path d="M30 64 C 50 54, 63 32, 67 1 C 72 22, 76 42, 78 60 C 62 61, 46 62, 30 64 Z" fill="url(#sailFront)" />
    </Svg>
  );
}

/**
 * Logo de MSAIL: las velas y el nombre. `size` es el tamaño de las letras.
 * Se usa en la barra de arriba (web), en la home y en los encabezados de las secciones.
 */
export function Brand({ size = 18 }: { size?: number }) {
  return (
    <View style={[styles.row, { gap: Math.round(size * 0.45) }]} accessibilityRole="header" accessibilityLabel="MSAIL">
      <SailsMark size={Math.round(size * 1.45)} />
      <Text style={[styles.text, { fontSize: size, letterSpacing: size * 0.08 }]}>MSAIL</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { color: colors.text, fontFamily: fonts.display },
});
