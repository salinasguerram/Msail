import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { cancelQuote, getMyQuotes, type Quote, type QuoteStatus } from '@/api/professionals';
import { errorMessage } from '@/auth/errors';
import { withAuth } from '@/auth/withAuth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useDialogs } from '@/components/Dialogs';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

const STATUS_COLORS: Record<QuoteStatus, string> = {
  pending: colors.warning,
  sent: colors.primary,
  answered: colors.success,
  closed: colors.textMuted,
  cancelled: colors.textMuted,
};

export default withAuth(MyQuotesScreen);

/** Mis pedidos de presupuesto, con su estado y la respuesta. */
function MyQuotesScreen() {
  const { t, i18n } = useTranslation();
  const { confirm, notify } = useDialogs();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fetchQuotes = useCallback(
    () =>
      getMyQuotes()
        .then((data) => setQuotes(data.results))
        .catch(setError),
    [],
  );

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  async function cancel(quote: Quote) {
    const ok = await confirm({ title: t('quotes.confirmCancel'), confirmLabel: t('quotes.cancel'), destructive: true });
    if (!ok) return;
    try {
      const updated = await cancelQuote(quote.id);
      setQuotes((list) => list?.map((q) => (q.id === updated.id ? updated : q)) ?? null);
      notify(t('quotes.cancelled'));
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    }
  }

  if (!quotes) {
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={typography.body}>{errorMessage(error, t)}</Text>
            <Button title={t('profile.retry')} variant="ghost" onPress={() => fetchQuotes()} />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        )}
      </Screen>
    );
  }

  const open = (slug: string) => router.push({ pathname: '/professionals/[slug]', params: { slug } });

  return (
    <Screen>
      {quotes.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
          <Text style={[typography.body, { textAlign: 'center' }]}>{t('quotes.empty')}</Text>
          <Button title={t('quotes.goToProfessionals')} variant="secondary" onPress={() => router.navigate('/professionals')} />
        </Card>
      ) : null}

      {quotes.map((quote) => (
        <Card key={quote.id} style={{ gap: spacing.sm }}>
          <View style={styles.header}>
            <Pressable accessibilityRole="link" onPress={() => open(quote.professional.slug)} style={{ flex: 1 }}>
              <Text style={[typography.body, { fontWeight: '700' }]}>{quote.professional.name}</Text>
              <Text style={typography.caption}>
                {[quote.specialty, new Date(quote.created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
            <View style={[styles.status, { borderColor: STATUS_COLORS[quote.status] }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[quote.status] }]}>{t(`quotes.status.${quote.status}`)}</Text>
            </View>
          </View>
          <Text style={typography.body} numberOfLines={3}>
            {quote.details}
          </Text>
          {quote.response ? (
            <View style={styles.response}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
              <Text style={[typography.body, { flex: 1 }]}>{quote.response}</Text>
            </View>
          ) : (
            <Text style={typography.caption}>{t(quote.status === 'sent' ? 'quotes.waitingEmail' : 'quotes.waiting')}</Text>
          )}
          <View style={styles.actions}>
            {quote.can_review ? (
              <Button title={t('quotes.review')} variant="secondary" onPress={() => open(quote.professional.slug)} />
            ) : null}
            {quote.can_cancel ? <Button title={t('quotes.cancel')} variant="ghost" onPress={() => cancel(quote)} /> : null}
          </View>
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
  actions: { gap: spacing.xs },
});
