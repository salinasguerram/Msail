import { api } from '@/api/client';

export type PremiumPlan = {
  id: number;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  /** Beneficios, uno por línea. */
  features: string[];
  /** El recomendado. */
  is_highlighted: boolean;
  /** Se puede pagar ya (Stripe configurado y el plan conectado). */
  can_buy: boolean;
};

export type PremiumSubscription = {
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  source: 'stripe' | 'manual';
  plan: string | null;
  started_at: string;
  /** null: no vence. */
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** Se puede cambiar la tarjeta o cancelar desde el portal de Stripe. */
  can_manage: boolean;
};

export type PremiumInfo = {
  plans: PremiumPlan[];
  is_premium: boolean;
  subscription: PremiumSubscription | null;
  payments_enabled: boolean;
};

export const getPremium = () => api<PremiumInfo>('/premium/');
/** Página de pago de Stripe para ese plan. */
export const startCheckout = (plan: number) => api<{ url: string }>('/premium/checkout/', { method: 'POST', body: { plan } });
/** Portal de Stripe (tarjeta, facturas, cancelar). */
export const openBillingPortal = () => api<{ url: string }>('/premium/portal/', { method: 'POST' });
