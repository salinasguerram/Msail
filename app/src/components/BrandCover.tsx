import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { className, useBoatClasses } from '@/api/useBoatClasses';
import { RegattaArt } from '@/components/HomeCards';
import { fonts, spacing } from '@/theme';

/**
 * Portada para lo que todavía no tiene foto (noticias, marinas): la ilustración de regata de MSAIL y, si entra,
 * el nombre del evento o lugar y las clases. Así las tarjetas no se ven vacías mientras no haya fotos reales.
 */
export function BrandCover({
  title,
  classes = [],
  compact = false,
  style,
}: {
  /** Evento, regata o lugar. */
  title?: string | null;
  /** Clases de embarcación (slugs). */
  classes?: string[];
  /** Miniatura chica: solo la ilustración. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const catalog = useBoatClasses();
  const kicker = classes.map((slug) => className(catalog, slug)).join(' · ');
  return (
    <View style={[styles.cover, style]}>
      <View style={StyleSheet.absoluteFill}>
        <RegattaArt />
      </View>
      {compact || (!title && !kicker) ? null : (
        <>
          <View style={styles.shade} />
          <View style={styles.text}>
            {kicker ? (
              <Text style={styles.kicker} numberOfLines={1}>
                {kicker}
              </Text>
            ) : null}
            {title ? (
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: '#0b2c5e' },
  // Oscurece la parte de abajo (el mar) para que el texto se lea.
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', backgroundColor: 'rgba(5,11,24,0.55)' },
  text: { padding: spacing.md, gap: 2 },
  kicker: { color: '#2fd4e0', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: {
    color: '#fff',
    fontFamily: fonts.heading,
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
});
