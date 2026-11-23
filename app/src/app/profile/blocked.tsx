import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/auth/errors';
import { Card } from '@/components/Card';
import { useDialogs } from '@/components/Dialogs';
import { getBlocked, unblockUser } from '@/components/Moderation';
import { Screen } from '@/components/Screen';
import { colors, fonts, radius, spacing, typography } from '@/theme';

type Blocked = { user_id: number; name: string; created_at: string };

/** Usuarios que bloqueé, con la opción de desbloquearlos. */
export default function BlockedUsersScreen() {
  const { t } = useTranslation();
  const { notify } = useDialogs();
  const [list, setList] = useState<Blocked[] | null>(null);

  const load = useCallback(() => {
    getBlocked()
      .then(setList)
      .catch((e) => {
        setList([]);
        notify(errorMessage(e, t), 'error');
      });
  }, [notify, t]);
  useEffect(load, [load]);

  const unblock = async (item: Blocked) => {
    try {
      await unblockUser(item.user_id);
      setList((current) => current?.filter((b) => b.user_id !== item.user_id) ?? null);
      notify(t('moderation.unblocked', { name: item.name }));
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    }
  };

  return (
    <Screen>
      {!list ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : !list.length ? (
        <Card style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="ban-outline" size={28} color={colors.textMuted} />
          <Text style={typography.body}>{t('moderation.noneBlocked')}</Text>
        </Card>
      ) : (
        <Card style={{ gap: spacing.sm }}>
          {list.map((item) => (
            <View key={item.user_id} style={styles.row}>
              <Text style={[typography.body, { flex: 1, fontWeight: '700' }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => unblock(item)} style={styles.unblock}>
                <Text style={styles.unblockText}>{t('moderation.unblock')}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  unblock: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  unblockText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
});
