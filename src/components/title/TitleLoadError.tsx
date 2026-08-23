'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function TitleLoadError() {
  const router = useRouter();
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-primary">Provider unavailable</p>
        <h1 className="mt-2 text-3xl font-semibold">This title could not load</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          The provider did not respond. Try again, or return to browse the catalog.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => router.refresh()}>Try again</Button>
          <Button variant="outline" onClick={() => router.push('/')}>
            Back to browse
          </Button>
        </div>
      </div>
    </div>
  );
}
