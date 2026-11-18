import * as Location from 'expo-location';

import { getCountries } from '@/api/catalogs';
import { approximateLocation } from '@/utils/homeLocation';

export type Coords = { lat: number; lng: number };

/**
 * Ubicación del dispositivo. Sin `ask` solo la usa si ya dieron permiso (no muestra el cartel);
 * con `ask` lo pide. null si no hay permiso o no se pudo obtener (se usa la ubicación aproximada).
 */
export async function deviceLocation(ask: boolean): Promise<Coords | null> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Location.requestForegroundPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
    const position = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Dónde está la persona: el dispositivo (si `ask`, pide permiso; si no, solo si ya lo dio) o, si no se puede,
 * la ubicación aproximada (país de la cuenta o zona horaria).
 */
export async function locateMe(userCountry: string | null | undefined, ask: boolean): Promise<Coords> {
  const precise = await deviceLocation(ask);
  if (precise) return precise;
  let country = null;
  if (userCountry) {
    const list = await getCountries().catch(() => []);
    country = list.find((c) => c.iso_code === userCountry) ?? null;
  }
  return approximateLocation(country);
}

/** Lugar de pronóstico "tu ubicación" (el backend lo redondea a una grilla de ~25 km). */
export const herePlace = ({ lat, lng }: Coords) => `here:${lat.toFixed(2)},${lng.toFixed(2)}`;
