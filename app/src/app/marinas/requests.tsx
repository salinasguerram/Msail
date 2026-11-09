import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { cancelBerthRequest, getMyBerthRequests, type BerthRequest, type BerthRequestStatus } from '@/api/marinas';
import { errorMessage } from '@/auth/errors';
import { withAuth } from '@/auth/withAuth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useDialogs } from '@/components/Dialogs';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

const STATUS_COLORS: Record<BerthRequestStatus, string> = {
  pending: colors.warning,
  accepted: colors.success,
  rejected: colors.danger,
  cancelled: colors.textMuted,
};

export default withAuth(MyBerthRequestsScreen);

/** Mis solicitudes de amarre con su estado y la respuesta de la marina. */
function MyBerthRequestsScreen() {
  const { t, i18n } = useTranslation();
  const { confirm, notify } = useDialogs();
  const [requests, setRequests] = useState<BerthRequest[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fetchRequests = useCallback(
    () =>
      getMyBerthRequests()
        .then((data) => setRequests(data.results))
        .catch(setError),
    [],
  );

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function cancel(request: BerthRequest) {
    const ok = await confirm({ title: t('berth.confirmCancel'), confirmLabel: t('berth.cancel'), destructive: true });
    if (!ok) return;
    try {
      const updated = await cancelBerthRequest(request.id);
      setRequests((list) => list?.map((r) => (r.id === updated.id ? updated : r)) ?? null);
      notify(t('berth.cancelled'));
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    }
  }

  const shortDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  if (!requests) {
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={typography.body}>{errorMessage(error, t)}</Text>
            <Button title={t('profile.retry')} variant="ghost" onPress={() => fetchRequests()} />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      {requests.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="boat-outline" size={28} color={colors.textMuted} />
          <Text style={[typography.body, { textAlign: 'center' }]}>{t('berth.empty')}</Text>
          <Button title={t('berth.goToMarinas')} variant="secondary" onPress={() => router.navigate('/marinas')} />
        </Card>
      ) : null}

      {requests.map((request) => (
        <Card key={request.id} style={{ gap: spacing.sm }}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/marinas/[slug]', params: { slug: request.marina.slug } })}
              style={{ flex: 1 }}
            >
              <Text style={[typography.body, { fontWeight: '700' }]}>{request.marina.name}</Text>
              <Text style={typography.caption}>{[request.marina.city, request.marina.country_name].join(' · ')}</Text>
            </Pressable>
            <View style={[styles.status, { borderColor: STATUS_COLORS[request.status] }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[request.status] }]}>{t(`berth.status.${request.status}`)}</Text>
            </View>
          </View>
          <Text style={typography.body}>
            {request.boat_name} · {request.length_m} m
          </Text>
          <Text style={typography.caption}>
            {t('berth.range', { from: shortDate(request.arrival), to: shortDate(request.departure), count: request.nights })}
          </Text>
          {request.response ? (
            <View style={styles.response}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
              <Text style={[typography.body, { flex: 1 }]}>{request.response}</Text>
            </View>
          ) : request.status === 'pending' ? (
            <Text style={typography.caption}>{t('berth.waiting')}</Text>
          ) : null}
          {request.can_cancel ? <Button title={t('berth.cancel')} variant="ghost" onPress={() => cancel(request)} /> : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  status: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  response: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
});
