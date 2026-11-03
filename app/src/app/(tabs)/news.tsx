import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function NewsScreen() {
  const { t } = useTranslation();
  return <ComingSoon icon="newspaper-outline" title={t('sections.news.title')} description={t('sections.news.description')} week={4} />;
}
