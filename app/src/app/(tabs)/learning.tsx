import { Redirect } from 'expo-router';

/** Escuelas y formación ahora es parte de MSailing: los links viejos llevan a esa sección. */
export default function LearningScreen() {
  return <Redirect href={{ pathname: '/msailing', params: { section: 'school' } }} />;
}
