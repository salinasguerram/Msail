import { useEffect, useState, type ReactElement } from 'react';
import { View } from 'react-native';

type Navigation = {
  isFocused: () => boolean;
  addListener: (event: 'focus' | 'blur', callback: () => void) => () => void;
};

/**
 * Las pantallas son transparentes (detrás se ve el planeta). Las secciones que quedan abiertas atrás (otras pestañas,
 * o la pantalla anterior al abrir una ficha) se ocultan: si no, se verían superpuestas con la que está adelante.
 * Se usa como `screenLayout` de los navegadores.
 */
export function OnlyWhenFocused({ navigation, children }: { navigation: Navigation; children: ReactElement }) {
  const [focused, setFocused] = useState(() => navigation.isFocused());
  useEffect(() => {
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return <View style={{ flex: 1, display: focused ? 'flex' : 'none' }}>{children}</View>;
}
