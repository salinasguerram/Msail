import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getUnreadCount } from '@/api/notifications';
import { useAuth } from '@/auth/AuthContext';
import { colors, spacing } from '@/theme';

const REFRESH_MS = 60_000;

/** Campana de avisos con la cantidad sin leer. Solo aparece con la sesión iniciada. */
export function NotificationBell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Se actualiza al cambiar de pantalla (ej. al volver de los avisos) y cada minuto.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = () =>
      getUnreadCount()
        .then((data) => active && setUnread(data.unread))
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user, pathname]);

  if (!user) return null;
  const badge = unread > 9 ? '9+' : String(unread);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? t('notifications.bellUnread', { count: unread }) : t('notifications.bell')}
      hitSlop={12}
      onPress={() => router.push('/notifications')}
      style={{ paddingHorizontal: spacing.lg }}
    >
      <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={24} color={colors.text} />
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: spacing.lg - 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
