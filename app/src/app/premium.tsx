import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { getPremium, openBillingPortal, startCheckout, type PremiumInfo, type PremiumPlan } from '@/api/premium';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { SailsMark } from '@/components/Brand';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PREMIUM, PREMIUM_SOFT } from '@/components/Premium';
import { Screen } from '@/components/Screen';
import { colors, fonts, radius, spacing, typography } from '@/theme';
import { formatMoney } from '@/utils/marinaRates';

/** Abre el pago o el portal de Stripe: en la web en la misma pestaña (vuelve sola a la app); en el celular, en el navegador. */
function openPayment(url: string) {
  if (Platform.OS === 'web') window.location.assign(url);
  else Linking.openURL(url);
}

/**
 * MSAIL Premium: los planes y la membresía del usuario. Se paga con Stripe; al volver del pago
 * (?checkout=success) se vuelve a pedir la cuenta para habilitar el contenido exclusivo.
 */
export default function PremiumScreen() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const [info, setInfo] = useState<PremiumInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchInfo = useCallback(() => getPremium().then(setInfo).catch(setError), []);
  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);
  // Al volver de pagar: Stripe avisa al servidor en unos segundos, así que se actualiza la cuenta.
  useEffect(() => {
    if (checkout === 'success') refreshUser().catch(() => {});
  }, [checkout, refreshUser]);

  const reload = () => {
    setError(null);
    fetchInfo();
    refreshUser().catch(() => {});
  };

  const plans = info?.plans ?? [];
  const plan = plans.find((p) => p.id === selected) ?? plans.find((p) => p.is_highlighted) ?? plans[0];
  const features = plan?.features.length ? plan.features : (plans.find((p) => p.features.length)?.features ?? []);

  const subscribe = async () => {
    if (!plan) return;
    if (!user) {
      router.push({ pathname: '/login', params: { next: '/premium' } });
      return;
    }
    if (!plan.can_buy) {
      setNotice(t('premium.paymentsSoon'));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      openPayment((await startCheckout(plan.id)).url);
    } catch (e) {
      setNotice(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  const manage = async () => {
    setBusy(true);
    try {
      openPayment((await openBillingPortal()).url);
    } catch (e) {
      setNotice(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });
  const subscription = info?.subscription;

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroMark}>
          <SailsMark size={40} />
        </View>
        <Text style={styles.brand}>
          MSAIL <Text style={{ color: PREMIUM }}>Premium</Text>
        </Text>
        <Text style={[typography.body, styles.center, { color: colors.textMuted }]}>{t('premium.tagline')}</Text>
      </View>

      {checkout === 'success' && !info?.is_premium ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={typography.body}>{t('premium.confirming')}</Text>
          <Button title={t('premium.refresh')} variant="ghost" onPress={reload} />
        </Card>
      ) : null}

      {error ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[typography.body, styles.center]}>{errorMessage(error, t)}</Text>
          <Button title={t('profile.retry')} variant="ghost" onPress={reload} />
        </Card>
      ) : !info ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : info.is_premium && subscription ? (
        <View style={styles.member}>
          <View style={styles.memberHeader}>
            <Ionicons name="star" size={22} color={PREMIUM} />
            <Text style={styles.memberTitle}>{t('premium.youArePremium')}</Text>
          </View>
          {subscription.plan ? <Text style={typography.body}>{subscription.plan}</Text> : null}
          <Text style={typography.caption}>
            {!subscription.current_period_end
              ? t('premium.noEnd')
              : subscription.cancel_at_period_end || subscription.source === 'manual'
                ? t('premium.endsOn', { date: date(subscription.current_period_end) })
                : t('premium.renewsOn', { date: date(subscription.current_period_end) })}
          </Text>
          {subscription.status === 'past_due' ? (
            <Text style={[typography.caption, { color: colors.warning }]}>{t('premium.pastDue')}</Text>
          ) : null}
          <Button title={t('premium.goToContent')} onPress={() => router.push({ pathname: '/msailing', params: { section: 'videos' } })} />
          {subscription.can_manage ? (
            <Button title={t('premium.manage')} variant="secondary" onPress={manage} loading={busy} />
          ) : (
            <Text style={[typography.caption, styles.center]}>{t('premium.manualManaged')}</Text>
          )}
        </View>
      ) : (
        <>
          {features.length ? (
            <Card style={{ gap: spacing.md }}>
              <Text style={typography.label}>{t('premium.includes')}</Text>
              {features.map((feature) => (
                <View key={feature} style={styles.feature}>
                  <Ionicons name="checkmark-circle" size={20} color={PREMIUM} />
                  <Text style={[typography.body, { flex: 1 }]}>{feature}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {plans.length ? (
            <View style={styles.plans}>
              {plans.map((p) => (
                <PlanCard key={p.id} plan={p} selected={p.id === plan?.id} onPress={() => setSelected(p.id)} />
              ))}
            </View>
          ) : (
            <Card>
              <Text style={[typography.body, styles.center]}>{t('premium.noPlans')}</Text>
            </Card>
          )}

          {plan ? (
            <Button
              title={user ? t('premium.subscribe', { plan: plan.name }) : t('premium.loginToSubscribe')}
              onPress={subscribe}
              loading={busy}
            />
          ) : null}
          <Text style={[typography.caption, styles.center]}>{t('premium.cancelAnytime')}</Text>
        </>
      )}

      {notice ? <Text style={[typography.body, styles.center, { color: colors.warning }]}>{notice}</Text> : null}
    </Screen>
  );
}

function PlanCard({ plan, selected, onPress }: { plan: PremiumPlan; selected: boolean; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const price = formatMoney(plan.price, plan.currency, i18n.language);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.plan, selected && styles.planSelected]}
    >
      {plan.is_highlighted ? (
        <View style={styles.recommended}>
          <Text style={styles.recommendedText}>{t('premium.recommended')}</Text>
        </View>
      ) : null}
      <Text style={styles.planName}>{plan.name}</Text>
      <Text style={styles.planPrice}>
        {price}
        <Text style={typography.caption}> / {t(`premium.per.${plan.interval}`)}</Text>
      </Text>
      {plan.interval === 'year' ? (
        <Text style={typography.caption}>
          {t('premium.perMonth', { price: formatMoney(Math.round((plan.price / 12) * 100) / 100, plan.currency, i18n.language) })}
        </Text>
      ) : null}
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? PREMIUM : colors.textMuted}
        style={styles.radio}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  heroMark: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: PREMIUM,
    backgroundColor: PREMIUM_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: colors.text, fontFamily: fonts.display, fontSize: 30, letterSpacing: 1 },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  plans: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  plan: {
    flexGrow: 1,
    flexBasis: 150,
    gap: 4,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  planSelected: { borderColor: PREMIUM, backgroundColor: colors.surfaceRaised },
  planName: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  planPrice: { color: colors.text, fontFamily: fonts.display, fontSize: 26 },
  radio: { position: 'absolute', top: spacing.md, right: spacing.md },
  recommended: {
    position: 'absolute',
    top: -10,
    left: spacing.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: PREMIUM,
  },
  recommendedText: { color: colors.background, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  member: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: PREMIUM,
    backgroundColor: colors.surface,
  },
  memberHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 20 },
});
