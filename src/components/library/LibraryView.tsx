'use client';

import Link from 'next/link';
import { Card } from '@/components/home/Card';
import { useLibrary, useSettings } from '@/lib/storage';

export function LibraryView() {
  const { settings } = useSettings();
  const library = useLibrary(settings.provider);
  return (
    <section className="pt-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Your library</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">My list</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {library.items.length} saved titles on this device
      </p>
      {library.items.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {library.items.map((item) => (
            <Card key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-border p-12 text-center">
          <p className="font-semibold">Your list is empty</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Save a title from its detail page to see it here.
          </p>
          <Link
            href="/search"
            className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Find a title
          </Link>
        </div>
      )}
    </section>
  );
}
