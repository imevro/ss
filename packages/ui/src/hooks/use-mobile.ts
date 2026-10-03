import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

/** Узкий экран: по нему набор прячет боковое меню в выдвижное. */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = globalThis.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(query.matches);
    const onChange = (): void => setIsMobile(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isMobile;
};
