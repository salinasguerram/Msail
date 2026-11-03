import { useEffect, useState } from 'react';

import { getBoatClasses, type BoatClass } from '@/api/profiles';

// El catálogo casi no cambia: se pide una vez por sesión de la app.
let cache: Promise<BoatClass[]> | null = null;

export function useBoatClasses() {
  const [classes, setClasses] = useState<BoatClass[]>([]);

  useEffect(() => {
    cache ??= getBoatClasses().catch((error) => {
      cache = null;
      throw error;
    });
    let active = true;
    cache.then((data) => active && setClasses(data)).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return classes;
}

export function className(classes: BoatClass[], slug: string | null) {
  return classes.find((c) => c.slug === slug)?.name ?? slug ?? '';
}
