import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Ícono según el código WMO del estado del cielo (de noche, luna en vez de sol). */
export function weatherIcon(code: number | null | undefined, night = false): IconName {
  if (code === null || code === undefined) return 'help-circle-outline';
  if (code === 0) return night ? 'moon-outline' : 'sunny-outline';
  if (code <= 2) return night ? 'cloudy-night-outline' : 'partly-sunny-outline';
  if (code <= 48) return 'cloudy-outline';
  if (code >= 95) return 'thunderstorm-outline';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow-outline';
  return 'rainy-outline';
}
