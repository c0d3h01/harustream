'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const router = useRouter();
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          The page you’re looking for has moved or never existed.
        </p>
        <div className="mt-6">
          <Button onClick={() => router.push('/')}>Back to home</Button>
        </div>
      </div>
    </main>
  );
}
