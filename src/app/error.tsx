'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reloaded = useRef(false);
  useEffect(() => {
    // biome-ignore lint/suspicious/noConsole: logging the boundary error is intentional so it reaches the browser console/devtools.
    console.error(error);
    // A deploy invalidates cached chunks — reload once to pick up the new build.
    const staleChunk =
      error.name === 'ChunkLoadError' ||
      /chunk\s*load|loading chunk|dynamically imported module/i.test(error.message);
    if (staleChunk && !reloaded.current) {
      reloaded.current = true;
      window.location.reload();
    }
  }, [error]);
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <p className="font-mono text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
          {'Something went wrong'}
        </p>
        <h1 className="mt-2 font-heading text-4xl tracking-[-0.03em]">
          {'We hit an unexpected error'}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {error.message || 'Try again — the next render may succeed.'}
        </p>
        <div className="mt-6">
          <Button onClick={reset}>{'Try again'}</Button>
        </div>
      </div>
    </main>
  );
}
