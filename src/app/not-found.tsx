import Link from 'next/link';
import { buttonClassName } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <p className="font-mono text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
          404
        </p>
        <h1 className="mt-2 font-heading text-4xl tracking-[-0.03em]">{'Page not found'}</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {"The page you're looking for has moved or never existed."}
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className={buttonClassName({
              className: 'transition-transform duration-150 active:scale-[0.98]',
            })}
          >
            {'Back to home'}
          </Link>
        </div>
      </div>
    </main>
  );
}
