'use client';

import { useEffect, useState } from 'react';

// True when the primary pointer is fine (mouse/trackpad), false on touch.
// Touch devices get hover-free, animation-light rendering: infinite CSS
// animations, scroll-linked parallax, and backdrop filters all get dropped
// for coarse pointers (see Hero), which removes the main Android scroll-jank
// sources. SSR/hydration assume a fine pointer; the effect corrects before
// the first user scroll.
const QUERY = '(pointer: fine)';

export function useIsFinePointer(): boolean {
  const [isFine, setIsFine] = useState(true);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    setIsFine(media.matches);
    const onChange = (event: MediaQueryListEvent) => setIsFine(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return isFine;
}
