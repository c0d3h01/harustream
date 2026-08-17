'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // biome-ignore lint/suspicious/noConsole: logging the boundary error is intentional so it reaches the browser console/devtools.
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <p className="text-sm font-semibold text-primary">Something went wrong</p>
        <h1 className="mt-2 text-3xl font-semibold">We hit an unexpected error</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {error.message || 'Try again — the next render may succeed.'}
        </p>
        <div className="mt-6">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
