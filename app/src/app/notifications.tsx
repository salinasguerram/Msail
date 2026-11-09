import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getNotifications, markRead, type AppNotification, type NotificationKind } from '@/api/notifications';
import { errorMessage } from '@/auth/errors';
import { withAuth } from '@/auth/withAuth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

const ICONS: Record<NotificationKind, ComponentProps<typeof Ionicons>['name']> = {
  results: 'trophy-outline',
  gallery: 'images-outline',
  dates: 'calendar-outline',
  starts: 'flag-outline',
  entries: 'create-outline',
  news: 'newspaper-outline',
  berth: 'boat-outline',
};

export default withAuth(NotificationsScreen);

/** Avisos de las regatas que sigo. */
function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // El estado se toca solo cuando llega la respuesta.
  const fetchPage = useCallback(
    (next: number) =>
      getNotifications(next)
        .then((data) => {
          setItems((current) => (next === 1 ? data.results : [...current, ...data.results]));
          setPage(next);
          setHasMore(!!data.next);
        })
        .catch(setError)
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  function loadMore() {
    setLoading(true);
    setError(null);
    fetchPage(page + 1);
  }

  async function open(item: AppNotification) {
    if (!item.read) {
      setItems((list) => list.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      markRead(item.id).catch(() => {});
    }
    if (item.kind === 'berth') router.push('/marinas/requests');
    else if (item.article) router.push({ pathname: '/news/[slug]', params: { slug: item.article } });
    else if (item.event) router.push({ pathname: '/events/[slug]', params: { slug: item.event } });
  }

  async function readAll() {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    await markRead().catch(() => {});
  }

  const when = (value: string) =>
    new Date(value).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const hasUnread = items.some((n) => !n.read);

  return (
    <Screen>
      {hasUnread ? <Button title={t('notifications.readAll')} variant="ghost" onPress={readAll} /> : null}

      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => open(item)}
          style={({ pressed }) => [styles.item, !item.read && styles.unread, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.icon}>
            <Ionicons name={ICONS[item.kind] ?? 'notifications-outline'} size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.body, { fontWeight: item.read ? '500' : '700' }]}>{item.title}</Text>
            {item.body ? <Text style={typography.caption}>{item.body}</Text> : null}
            <Text style={[typography.caption, { fontSize: 11 }]}>{when(item.created_at)}</Text>
          </View>
          {!item.read ? <View style={styles.dot} accessibilityLabel={t('notifications.unread')} /> : null}
        </Pressable>
      ))}

      {!loading && !error && items.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="notifications-off-outline" size={28} color={colors.textMuted} />
          <Text style={[typography.body, { textAlign: 'center' }]}>{t('notifications.empty')}</Text>
          <Text style={[typography.caption, { textAlign: 'center' }]}>{t('notifications.emptyHint')}</Text>
          <Button title={t('notifications.goToCalendar')} variant="secondary" onPress={() => router.navigate('/races')} />
        </Card>
      ) : null}
      {error ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={typography.body}>{errorMessage(error, t)}</Text>
          <Button title={t('profile.retry')} variant="ghost" onPress={() => (items.length ? loadMore() : fetchPage(1))} />
        </Card>
      ) : null}
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
      {hasMore && !loading && !error ? <Button title={t('gallery.more')} variant="secondary" onPress={loadMore} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unread: { borderColor: colors.primary },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
