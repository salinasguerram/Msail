import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { spacing } from '@/theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  /** Bordes con margen seguro. Las pantallas con header o tabs no necesitan el de arriba/abajo. */
  edges?: Edge[];
  /** Estilos extra del contenedor del contenido (ej. `flexGrow: 1` para ocupar toda la altura). */
  contentStyle?: ViewStyle;
};

export function Screen({ children, scroll = true, edges = ['left', 'right'], contentStyle }: Props) {
  const content = scroll ? (
    <ScrollView contentContainerStyle={[styles.content, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.fill} edges={edges}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Transparente: detrás se ve el planeta de fondo (components/explore/PlanetLayer).
  fill: { flex: 1, backgroundColor: 'transparent' },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
});
