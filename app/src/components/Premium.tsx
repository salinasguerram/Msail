import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Button } from '@/components/Button';
import { colors, fonts, radius, spacing, typography } from '@/theme';

/** Dorado de MSAIL Premium (el mismo tono de los avisos, para que combine con el azul noche). */
export const PREMIUM = colors.warning;
export const PREMIUM_SOFT = 'rgba(245,185,66,0.12)';

/** Etiqueta "PREMIUM": con candado si el usuario todavía no tiene acceso. */
export function PremiumBadge({ locked = false, style }: { locked?: boolean; style?: ViewStyle }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.badge, style]}>
      <Ionicons name={locked ? 'lock-closed' : 'star'} size={10} color={PREMIUM} />
      <Text style={styles.badgeText}>{t('premium.badge')}</Text>
    </View>
  );
}

/** Tarjeta para el contenido exclusivo que el usuario no puede ver: invita a hacerse Premium. */
export function PremiumLock({ title, text }: { title?: string; text?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.lock}>
      <View style={styles.lockIcon}>
        <Ionicons name="lock-closed" size={22} color={PREMIUM} />
      </View>
      <Text style={styles.lockTitle}>{title ?? t('premium.lockTitle')}</Text>
      <Text style={[typography.caption, { textAlign: 'center' }]}>{text ?? t('premium.lockText')}</Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Button title={t('premium.cta')} onPress={() => router.push('/premium')} />
      </View>
    </View>
  );
}

/** Acceso a Premium (en el perfil y en Videos): el estado de la membresía o la invitación a sumarse. */
export function PremiumEntry({ active, text }: { active: boolean; text: string }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/premium')}
      style={({ pressed }) => [styles.entry, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.entryIcon}>
        <Ionicons name={active ? 'star' : 'star-outline'} size={20} color={PREMIUM} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.entryTitle}>{active ? t('premium.youArePremium') : t('premium.title')}</Text>
        <Text style={typography.caption}>{text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: PREMIUM,
    backgroundColor: PREMIUM_SOFT,
  },
  badgeText: { color: PREMIUM, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  lock: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: PREMIUM,
    backgroundColor: colors.surface,
  },
  lockIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PREMIUM_SOFT,
  },
  lockTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 18, textAlign: 'center' },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: PREMIUM,
    backgroundColor: colors.surface,
  },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PREMIUM_SOFT,
  },
  entryTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 15 },
});
