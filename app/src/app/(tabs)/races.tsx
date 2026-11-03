import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function RacesScreen() {
  const { t } = useTranslation();
  return <ComingSoon icon="trophy-outline" title={t('sections.races.title')} description={t('sections.races.description')} week={3} />;
}
