import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getRaceTrack, type RaceTrack } from '@/api/events';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { TrackReplay } from '@/components/TrackReplay';
import { colors, fonts, radius, spacing, typography } from '@/theme';

/** Track de la carrera: la repetición con el GPS de cada barco (se abre desde la página de la regata). */
export default function RaceTrackScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [track, setTrack] = useState<RaceTrack | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fetchTrack = useCallback(() => getRaceTrack(id).then(setTrack).catch(setError), [id]);
  useEffect(() => {
    fetchTrack();
  }, [fetchTrack]);

  useLayoutEffect(() => {
    if (track) navigation.setOptions({ title: track.name });
  }, [navigation, track]);

  if (!track) {
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={[typography.body, { textAlign: 'center' }]}>{errorMessage(error, t)}</Text>
            <Button
              title={t('profile.retry')}
              variant="ghost"
              onPress={() => {
                setError(null);
                fetchTrack();
              }}
            />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Text style={typography.caption}>{track.event.name}</Text>
        <View style={styles.titleRow}>
          <Ionicons name="flag" size={22} color={colors.text} />
          <Text style={styles.title}>{track.name}</Text>
        </View>
      </View>
      {track.is_demo ? (
        <View style={styles.demo}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
          <Text style={[typography.caption, { flex: 1, color: colors.warning }]}>{t('track.demo')}</Text>
        </View>
      ) : null}
      {track.boats.length ? (
        <TrackReplay track={track} />
      ) : (
        <Card>
          <Text style={typography.caption}>{t('track.empty')}</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 24, flexShrink: 1 },
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: 'rgba(245,185,66,0.08)',
  },
});
