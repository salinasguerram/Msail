/**
 * Imagen satelital de alta resolución al acercarse al planeta (como las vistas de cerca de los bocetos).
 *
 * Por defecto usa Esri World Imagery (hasta ~1 m por píxel en muchas costas). Para publicar la app hay que usar una
 * cuenta propia: ArcGIS Location Platform tiene un plan gratis (~2 millones de mosaicos por mes) que da una API key;
 * se carga así en app/.env:
 *   EXPO_PUBLIC_SATELLITE_TILES_URL=https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=LA_KEY
 * Sirve cualquier proveedor de mosaicos XYZ ({z}/{x}/{y}), por ejemplo MapTiler o Mapbox con su clave.
 * Con EXPO_PUBLIC_SATELLITE_TILES_URL=off se desactiva y el planeta se queda con su imagen de siempre.
 */
const DEFAULT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const DEFAULT_ATTRIBUTION = 'Imágenes © Esri, Maxar, Earthstar Geographics';

const url = process.env.EXPO_PUBLIC_SATELLITE_TILES_URL?.trim() || DEFAULT_URL;

export type SatelliteConfig = { url: string; attribution: string; maxLevel: number } | null;

export const SATELLITE: SatelliteConfig =
  url === 'off' ? null : { url, attribution: process.env.EXPO_PUBLIC_SATELLITE_ATTRIBUTION?.trim() || DEFAULT_ATTRIBUTION, maxLevel: 18 };
