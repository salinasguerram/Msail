import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { MarinaDetail } from '@/api/marinas';
import { Card } from '@/components/Card';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing, typography } from '@/theme';
import { estimate, formatMoney, period } from '@/utils/marinaRates';

const meters = (value: string) => value.replace(',', '.').replace(/[^\d.]/g, '').slice(0, 6);

/** Precio orientativo informado por la marina, con la estimación para la eslora del barco. */
export function MarinaPrices({ marina, initialLength }: { marina: MarinaDetail; initialLength?: string }) {
  const { t, i18n } = useTranslation();
  const [length, setLength] = useState(initialLength ?? '');
  const boat = Number(length);

  if (marina.rates.length === 0) {
    return (
      <Card>
        <Text style={typography.label}>{t('marinas.prices')}</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('marinas.noPrices')}</Text>
      </Card>
    );
  }

  const updated = marina.prices_updated_on
    ? new Date(`${marina.prices_updated_on}T12:00:00`).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
    : null;

  return (
    <Card>
      <Text style={typography.label}>{t('marinas.prices')}</Text>

      {marina.rates.map((rate) => {
        const range =
          rate.min_length_m !== null || rate.max_length_m !== null
            ? t('marinas.lengthRange', { from: rate.min_length_m ?? 0, to: rate.max_length_m ?? '∞' })
            : null;
        const total = boat > 0 ? estimate(rate, boat) : null;
        return (
          <View key={rate.id} style={styles.rate}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.body, { fontWeight: '700' }]}>{rate.label}</Text>
              <Text style={typography.caption}>
                {[`${formatMoney(rate.amount, rate.currency, i18n.language)} ${t(`marinas.units.${rate.unit}`)}`, range]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {boat > 0 ? (
              <Text style={[styles.total, total === null && styles.na]}>
                {total === null
                  ? t('marinas.notForLength')
                  : t(`marinas.per.${period(rate)}`, { price: formatMoney(total, rate.currency, i18n.language) })}
              </Text>
            ) : null}
          </View>
        );
      })}

      <View style={styles.estimator}>
        <View style={{ width: 140 }}>
          <TextField
            label={t('marinas.myLength')}
            value={length}
            onChangeText={(v) => setLength(meters(v))}
            keyboardType="decimal-pad"
            placeholder="12"
          />
        </View>
        <Text style={[typography.caption, { flex: 1 }]}>{t('marinas.estimateHint')}</Text>
      </View>

      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
        <Text style={[typography.caption, { flex: 1 }]}>
          {[updated ? t('marinas.pricesUpdated', { date: updated }) : null, marina.price_notes, t('marinas.pricesDisclaimer')]
            .filter(Boolean)
            .join(' ')}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  rate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  total: { color: colors.text, fontWeight: '800', fontSize: 15, textAlign: 'right' },
  na: { color: colors.textMuted, fontWeight: '500', fontSize: 12 },
  estimator: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
});
