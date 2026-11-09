import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getResult, type ResultDetail } from '@/api/profiles';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { errorMessage } from '@/auth/errors';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

/** Detalle de un resultado. Si está vinculado a una regata del calendario, abre su página. */
export default function ResultDetailScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const classes = useBoatClasses();
  const [result, setResult] = useState<ResultDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    getResult(Number(id)).then(setResult).catch(setError);
  }, [id]);

  useFocusEffect(load);

  if (!result) {
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.danger }}>{errorMessage(error, t)}</Text>
            <Button title={t('profile.retry')} variant="ghost" onPress={load} />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        )}
      </Screen>
    );
  }

  const podium = result.position <= 3;
  const date = new Date(`${result.date}T12:00:00`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const rows: [string, string | null | undefined][] = [
    [t('result.date'), date],
    [t('result.location'), result.location],
    [t('result.boatClass'), result.boat_class ? className(classes, result.boat_class) : null],
    [t('result.role'), result.role ? t(`sailor.roles.${result.role}`) : null],
  ];

  return (
    <Screen>
      <Card style={styles.header}>
        <View style={[styles.position, podium && styles.podium]}>
          <Text style={[styles.positionText, podium && { color: '#fff' }]}>{result.position}º</Text>
          {result.fleet_size ? (
            <Text style={[typography.caption, podium && { color: '#fff' }]}>{t('result.of', { count: result.fleet_size })}</Text>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={typography.heading}>{result.event_name}</Text>
          {result.event ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/events/[slug]', params: { slug: result.event! } })}
              style={styles.eventLink}
              hitSlop={6}
            >
              <Ionicons name="trophy-outline" size={16} color={colors.primary} />
              <Text style={styles.eventLinkText}>{t('result.openEvent')}</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>

      <Card>
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={typography.caption}>{label}</Text>
              <Text style={[typography.body, { flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
            </View>
          ))}
      </Card>

      <Card>
        <Text style={typography.label}>{t('result.sailor')}</Text>
        <View style={styles.row}>
          <Avatar uri={result.sailor.avatar} initials={result.sailor.name.slice(0, 2).toUpperCase()} size={44} />
          <Text style={[typography.body, { flex: 1, fontWeight: '600' }]}>{result.sailor.name}</Text>
        </View>
      </Card>

      {result.boat_detail || result.boat_name ? (
        <Card>
          <Text style={typography.label}>{t('result.boat')}</Text>
          {result.boat_detail ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/boats/[id]', params: { id: String(result.boat_detail!.id) } })}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="boat-outline" size={24} color={colors.primary} />
              <Text style={[typography.body, { flex: 1, fontWeight: '600' }]}>
                {[result.boat_detail.name, result.boat_detail.sail_number].filter(Boolean).join(' · ')}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ) : (
            <Text style={typography.body}>{result.boat_name}</Text>
          )}
        </Card>
      ) : null}

      {result.is_mine ? (
        <Button
          title={t('result.editTitle')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/profile/result', params: { id: String(result.id) } })}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eventLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  eventLinkText: { color: colors.primary, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  position: {
    minWidth: 72,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podium: { backgroundColor: colors.primary, borderColor: colors.primary },
  positionText: { color: colors.text, fontWeight: '800', fontSize: 26 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
