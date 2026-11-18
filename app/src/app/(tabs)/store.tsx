import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

/** Tienda náutica (rigging, cubierta, ropa). Se define con Miguel: quién vende, envíos, stock y cobro con Stripe. */
export default function StoreScreen() {
  const { t } = useTranslation();
  return <ComingSoon icon="bag-handle-outline" title={t('store.title')} description={t('store.description')} />;
}
