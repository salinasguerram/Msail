import type { MarinaRate } from '@/api/marinas';

const FEET_PER_METER = 3.28084;

/** Importe con el símbolo de su moneda, en el idioma de la app (ej. "€ 4,90" / "£4.90"). */
export function formatMoney(amount: number, currency: string, language: string) {
  try {
    return new Intl.NumberFormat(language, {
      style: 'currency',
      currency,
      // "£" en lugar de "GBP" (en español el formato por defecto usa el código).
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function appliesTo(rate: MarinaRate, length: number) {
  if (rate.min_length_m !== null && length < rate.min_length_m) return false;
  if (rate.max_length_m !== null && length > rate.max_length_m) return false;
  return true;
}

/**
 * Precio estimado de una tarifa para un barco de esa eslora (por noche o por mes, según la unidad).
 * null si la tarifa no aplica a esa eslora.
 */
export function estimate(rate: MarinaRate, length: number) {
  if (!appliesTo(rate, length)) return null;
  switch (rate.unit) {
    case 'meter_night':
    case 'meter_month':
      return rate.amount * length;
    case 'foot_night':
      return rate.amount * length * FEET_PER_METER;
    default:
      return rate.amount;
  }
}

/** Si la estimación es por noche o por mes. */
export const period = (rate: MarinaRate) => (rate.unit.endsWith('month') ? 'month' : 'night');
