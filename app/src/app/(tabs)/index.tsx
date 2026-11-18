import { View } from 'react-native';

/**
 * Explorar. El planeta y el contenido de la home no están acá: viven en una capa del layout raíz
 * (components/explore/PlanetLayer) para que el planeta se vea siempre, de fondo, en todas las secciones.
 * Esta ruta solo marca que se está en Explorar.
 */
export default function ExploreScreen() {
  return <View style={{ flex: 1 }} pointerEvents="none" />;
}
