import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function LearningScreen() {
  const { t } = useTranslation();
  return <ComingSoon icon="school-outline" title={t('sections.learning.title')} description={t('sections.learning.description')} week={7} />;
}
