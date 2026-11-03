import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

type Props = {
  uri?: string | null;
  initials: string;
  size?: number;
  loading?: boolean;
  /** Si se pasa, el avatar se puede tocar para cambiar la foto. */
  onPress?: () => void;
};

export function Avatar({ uri, initials, size = 64, loading = false, onPress }: Props) {
  const { t } = useTranslation();
  const circle = { width: size, height: size, borderRadius: size / 2 };

  const content = (
    <View style={[styles.circle, circle]}>
      {uri ? (
        <Image source={{ uri }} style={circle} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.34 }]}>{initials}</Text>
      )}
      {loading ? (
        <View style={[styles.overlay, circle]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('photos.changeAvatar')} onPress={onPress} disabled={loading}>
      {content}
      <View style={styles.badge}>
        <Ionicons name="camera" size={13} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { color: colors.text, fontWeight: '800' },
  overlay: { position: 'absolute', backgroundColor: 'rgba(5,11,24,0.6)', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 5,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
