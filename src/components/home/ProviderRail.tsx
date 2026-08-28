'use client';

import { ArrowUpRight, Play } from 'lucide-react';
import Link from 'next/link';
import { localeHref, useLocale } from '@/lib/i18n';

import { vegaProviderInventory } from '@/providers/vegaProviders';

const providerCards = [
  { id: 'netflixMirror', name: 'Netflix', label: 'Provider mirror', tone: 'bg-red-950/80' },
  { id: 'primeMirror', name: 'Prime Video', label: 'Provider mirror', tone: 'bg-sky-950/80' },
  { id: 'hiAnime', name: 'AniWave', label: 'Anime catalog', tone: 'bg-indigo-950/80' },
  { id: 'movieBox', name: 'MovieBox', label: 'Movies & series', tone: 'bg-violet-950/80' },
  { id: 'flixhq', name: 'FlixHQ', label: 'Movies & series', tone: 'bg-slate-800' },
  { id: 'showbox', name: 'Showbox', label: 'Movies & series', tone: 'bg-orange-950/80' },
];

const knownProviderIds = new Set(vegaProviderInventory.map((provider) => provider.id));
const providers = providerCards.filter((provider) => knownProviderIds.has(provider.id));

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {providers.map((provider) => (
          <Link
            key={provider.name}
            href={localeHref(locale, `/search?q=${encodeURIComponent(provider.name)}`)}
            className={`group relative flex min-h-24 items-end overflow-hidden rounded-xl border border-border/70 p-4 ${provider.tone} transition duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
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
