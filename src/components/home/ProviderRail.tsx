'use client';

import { ArrowUpRight, Play } from 'lucide-react';
import Link from 'next/link';
import { localeHref, useLocale } from '@/lib/i18n';

import { vegaProviderInventory } from '@/providers/vegaProviders';

const tones = ['bg-primary/20', 'bg-secondary', 'bg-muted', 'bg-accent/30'];
const providers = vegaProviderInventory.map((provider, index) => ({
  ...provider,
  label: provider.id === 'vega' ? 'Primary catalog' : 'Streaming provider',
  tone: tones[index % tones.length],
}));

export function ProviderRail() {
  const { locale } = useLocale();
  return (
    <section className="mt-12" aria-labelledby="providers-heading">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Explore by service
          </p>
          <h2 id="providers-heading" className="mt-1 text-xl font-bold tracking-tight">
            Streaming providers
          </h2>
        </div>
        <Link
          href={localeHref(locale, '/search')}
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
        >
          View all <ArrowUpRight className="size-4" />
        </Link>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {providers.map((provider) => (
          <Link
            key={provider.name}
            href={localeHref(locale, `/?provider=${encodeURIComponent(provider.id)}`)}
            className={`group relative flex min-h-24 w-44 shrink-0 snap-start items-end overflow-hidden rounded-xl border border-border/70 p-4 ${provider.tone} transition duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            <div className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-foreground/10 text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
              <Play className="size-3 fill-current" />
            </div>
            <div>
              <p className="text-lg font-black tracking-[-0.06em] text-foreground">
                {provider.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{provider.label}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
