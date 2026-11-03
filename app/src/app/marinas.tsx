import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function MarinasScreen() {
  const { t } = useTranslation();
  return <ComingSoon icon="boat-outline" title={t('sections.marinas.title')} description={t('sections.marinas.description')} week={5} />;
}
