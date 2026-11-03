import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function ProfessionalsScreen() {
  const { t } = useTranslation();
  return <ComingSoon icon="construct-outline" title={t('sections.professionals.title')} description={t('sections.professionals.description')} week={6} />;
}
