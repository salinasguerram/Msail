import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

/** Ranking deportivo por temporada, regatas y trackdays. Falta definir con Miguel el sistema de puntos. */
export default function RankingScreen() {
  const { t } = useTranslation();
  return <ComingSoon icon="podium-outline" title={t('ranking.title')} description={t('ranking.description')} />;
}
