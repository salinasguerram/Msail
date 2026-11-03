import { Redirect, useLocalSearchParams, usePathname } from 'expo-router';
import type { ComponentType } from 'react';

import { useAuth } from '@/auth/AuthContext';

/**
 * Protege una pantalla: sin sesión, manda al login y, después de entrar, vuelve a esta misma ruta.
 * Sirve también para quien abre la URL directo en la web.
 */
export function withAuth<P extends object>(Screen: ComponentType<P>) {
  function Protected(props: P) {
    const { user } = useAuth();
    const pathname = usePathname();
    const params = useLocalSearchParams<Record<string, string>>();
    if (!user) {
      const query = new URLSearchParams(params).toString();
      return <Redirect href={{ pathname: '/login', params: { next: query ? `${pathname}?${query}` : pathname } }} />;
    }
    return <Screen {...props} />;
  }
  Protected.displayName = `withAuth(${Screen.displayName ?? Screen.name})`;
  return Protected;
}
