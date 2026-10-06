'use client';

import { useRouter } from 'next/navigation';
import { Button } from './button';

interface LoadErrorProps {
  retry?: () => void;
  back?: () => void;
}

export function LoadError({ retry, back }: LoadErrorProps) {
  const router = useRouter();
  const handleRetry = retry ?? (() => router.refresh());
  const handleBack = back ?? (() => router.push('/', { transitionTypes: ['nav-back'] }));
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div>
        <p className="font-mono text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
          {'Something went wrong'}
        </p>
        <h1 className="mt-2 font-heading text-4xl tracking-[-0.01em]">{'This could not load'}</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {'The provider did not respond. Try again, or return to browse the catalog.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            onClick={handleRetry}
            className="transition-transform duration-150 active:scale-[0.98]"
          >
            {'Try again'}
          </Button>
          <Button
            variant="outline"
            onClick={handleBack}
            className="transition-transform duration-150 active:scale-[0.98]"
          >
            {'Back to browse'}
          </Button>
        </div>
      </div>
    </div>
  );
}
