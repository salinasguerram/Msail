import { router, type Href } from 'expo-router';

/** Vuelve a la pantalla anterior; si no hay (ej. recarga en la web), va a `fallback`. */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
