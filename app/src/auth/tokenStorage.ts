import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Guarda los tokens en el llavero del sistema (Keychain en iOS, Keystore en Android).
 * En la web no existe ese almacenamiento, así que se usa localStorage.
 */
const KEY = 'msail.tokens';

export type Tokens = { access: string; refresh: string };

export async function loadTokens(): Promise<Tokens | null> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: Tokens) {
  const raw = JSON.stringify(tokens);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
  else await SecureStore.setItemAsync(KEY, raw);
}

export async function clearTokens() {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // nada que borrar
  }
}
