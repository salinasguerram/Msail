import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { useDialogs } from '@/components/Dialogs';
import { colors } from '@/theme';

const REASONS = ['spam', 'offensive', 'false', 'inappropriate', 'other'] as const;

export const blockUser = (userId: number) => api('/moderation/blocks/', { method: 'POST', body: { user: userId } });
export const unblockUser = (userId: number) => api(`/moderation/blocks/${userId}/`, { method: 'DELETE' });
export const getBlocked = () => api<{ user_id: number; name: string; created_at: string }[]>('/moderation/blocks/');

/**
 * Botón «…» sobre el contenido de otro usuario (un navegante en Tripulaciones, una reseña): reportarlo al equipo
 * de MSAIL o bloquear a esa persona (deja de ver su perfil y sus reseñas). Lo piden App Store y Google Play.
 */
export function ModerationMenu({
  userId,
  name,
  reviewId,
  onBlocked,
}: {
  userId: number;
  name: string;
  /** Si es una reseña, se reporta la reseña; si no, el perfil. */
  reviewId?: number;
  onBlocked?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { choose, confirm, notify } = useDialogs();

  if (user?.id === userId) return null;

  const open = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    const picked = await choose({
      title: name,
      choices: [
        { key: 'report', label: reviewId ? t('moderation.reportReview') : t('moderation.reportProfile') },
        { key: 'block', label: t('moderation.block', { name }), destructive: true },
      ],
    });
    try {
      if (picked === 'report') {
        const reason = await choose({
          title: t('moderation.whyTitle'),
          message: t('moderation.whyText'),
          choices: REASONS.map((key) => ({ key, label: t(`moderation.reasons.${key}`) })),
        });
        if (!reason) return;
        await api('/moderation/reports/', {
          method: 'POST',
          body: { target_type: reviewId ? 'review' : 'user', target_id: reviewId ?? userId, reason },
        });
        notify(t('moderation.reported'));
      } else if (picked === 'block') {
        const ok = await confirm({
          title: t('moderation.blockTitle', { name }),
          message: t('moderation.blockText'),
          confirmLabel: t('moderation.blockConfirm'),
          destructive: true,
        });
        if (!ok) return;
        await blockUser(userId);
        notify(t('moderation.blocked', { name }));
        onBlocked?.();
      }
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    }
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('moderation.menu')} onPress={open} hitSlop={10}>
      <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
    </Pressable>
  );
}
