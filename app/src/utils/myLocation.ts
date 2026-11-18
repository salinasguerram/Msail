import * as Location from 'expo-location';

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

/** Lugar de pronóstico "tu ubicación" (el backend lo redondea a una grilla de ~25 km). */
export const herePlace = ({ lat, lng }: Coords) => `here:${lat.toFixed(2)},${lng.toFixed(2)}`;
