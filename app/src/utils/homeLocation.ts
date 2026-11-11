/**
 * Ubicación aproximada para centrar el planeta al abrir la app, sin pedir permiso de ubicación
 * ni consultar servicios externos:
 * 1. el país de la cuenta (si hay sesión y tiene país cargado);
 * 2. la zona horaria del dispositivo (ej. "America/Argentina/Buenos_Aires");
 * 3. el desfase horario (da al menos el meridiano aproximado).
 */

type LatLng = { lat: number; lng: number };

// Zonas horarias frecuentes (ciudad de referencia). Se busca primero la zona completa y después el prefijo.
const TIME_ZONES: Record<string, [number, number]> = {
  'America/Argentina': [-34.6, -58.4],
  'America/Buenos_Aires': [-34.6, -58.4],
  'America/Montevideo': [-34.9, -56.2],
  'America/Santiago': [-33.4, -70.6],
  'America/Asuncion': [-25.3, -57.6],
  'America/La_Paz': [-16.5, -68.1],
  'America/Lima': [-12.0, -77.0],
  'America/Guayaquil': [-2.2, -79.9],
  'America/Bogota': [4.7, -74.1],
  'America/Caracas': [10.5, -66.9],
  'America/Sao_Paulo': [-23.5, -46.6],
  'America/Bahia': [-13.0, -38.5],
  'America/Fortaleza': [-3.7, -38.5],
  'America/Manaus': [-3.1, -60.0],
  'America/Panama': [9.0, -79.5],
  'America/Costa_Rica': [9.9, -84.1],
  'America/Mexico_City': [19.4, -99.1],
  'America/Cancun': [21.2, -86.8],
  'America/Havana': [23.1, -82.4],
  'America/Santo_Domingo': [18.5, -69.9],
  'America/Puerto_Rico': [18.5, -66.1],
  'America/New_York': [40.7, -74.0],
  'America/Toronto': [43.7, -79.4],
  'America/Chicago': [41.9, -87.6],
  'America/Denver': [39.7, -105.0],
  'America/Phoenix': [33.4, -112.1],
  'America/Los_Angeles': [34.0, -118.2],
  'America/Vancouver': [49.3, -123.1],
  'Pacific/Honolulu': [21.3, -157.9],
  'Europe/Madrid': [40.4, -3.7],
  'Atlantic/Canary': [28.1, -15.4],
  'Europe/Lisbon': [38.7, -9.1],
  'Europe/London': [51.5, -0.1],
  'Europe/Dublin': [53.3, -6.3],
  'Europe/Paris': [48.9, 2.4],
  'Europe/Monaco': [43.7, 7.4],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Malta': [35.9, 14.5],
  'Europe/Berlin': [52.5, 13.4],
  'Europe/Amsterdam': [52.4, 4.9],
  'Europe/Stockholm': [59.3, 18.1],
  'Europe/Athens': [38.0, 23.7],
  'Europe/Istanbul': [41.0, 29.0],
  'Africa/Johannesburg': [-33.9, 18.4],
  'Asia/Dubai': [25.2, 55.3],
  'Asia/Singapore': [1.3, 103.8],
  'Asia/Hong_Kong': [22.3, 114.2],
  'Asia/Tokyo': [35.7, 139.7],
  'Australia/Sydney': [-33.9, 151.2],
  'Australia/Melbourne': [-37.8, 145.0],
  'Australia/Perth': [-31.95, 115.9],
  'Pacific/Auckland': [-36.85, 174.8],
  // Prefijos: el centro aproximado de la región
  America: [10, -70],
  Europe: [47, 10],
  Africa: [5, 20],
  Asia: [30, 100],
  Australia: [-25, 134],
  Pacific: [-15, 175],
  Atlantic: [30, -30],
  Indian: [-10, 75],
};

function fromTimeZone(): LatLng | null {
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    zone = '';
  }
  // De lo más específico a lo más general: "America/Argentina/Cordoba" → "America/Argentina" → "America".
  const parts = zone.split('/');
  for (let n = parts.length; n > 0; n--) {
    const coords = TIME_ZONES[parts.slice(0, n).join('/')];
    if (coords) return { lat: coords[0], lng: coords[1] };
  }
  return null;
}

function fromOffset(): LatLng {
  // getTimezoneOffset da minutos detrás de UTC: 15° de longitud por hora.
  const hours = -new Date().getTimezoneOffset() / 60;
  return { lat: 20, lng: Math.max(-180, Math.min(180, hours * 15)) };
}

export function approximateLocation(country?: { latitude: string | number | null; longitude: string | number | null } | null): LatLng {
  if (country && country.latitude !== null && country.longitude !== null) {
    return { lat: Number(country.latitude), lng: Number(country.longitude) };
  }
  return fromTimeZone() ?? fromOffset();
}
