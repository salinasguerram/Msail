import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function WeatherScreen() {
  const { t } = useTranslation();
  return <ComingSoon icon="partly-sunny-outline" title={t('sections.weather.title')} description={t('sections.weather.description')} week={6} />;
}
