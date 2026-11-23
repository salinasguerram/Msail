import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from '@/api/client';

/**
 * Avisos push en el celular (iPhone y Android). El servidor manda cada aviso de la app (regata que empieza,
 * resultados, respuesta a un amarre...) a los celulares registrados acá. En la web no hay push (ver push.ts).
 * Necesita una versión compilada de la app (en Expo Go para Android no funcionan desde el SDK 53).
 */

// Con la app abierta también se muestran.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registered: string | null = null;

/** Pide permiso (la primera vez) y registra este celular en la cuenta. Si algo falla, la app sigue igual. */
export async function registerPush() {
  try {
    if (Platform.OS === 'android') {
      // En Android 13+ el permiso se pide recién cuando hay un canal.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'MSAIL',
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2f8cff',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // la app todavía no está conectada a EAS (se configura al compilar con eas build)
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api('/notifications/push-tokens/', { method: 'POST', body: { token, platform: Platform.OS } });
    registered = token;
  } catch {
    // sin red, sin permiso o en un simulador: no hay push, el resto anda igual
  }
}

/** Al cerrar sesión: este celular deja de recibir los avisos de esa cuenta. */
export async function unregisterPush() {
  if (!registered) return;
  const token = registered;
  registered = null;
  await api('/notifications/push-tokens/', { method: 'DELETE', body: { token } }).catch(() => {});
}

/** Al tocar un aviso se abre la pantalla correspondiente (la regata, la noticia, mis solicitudes...). */
export function usePushNavigation() {
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    };
    // Si la app se abrió tocando un aviso.
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);
}
