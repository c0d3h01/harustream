'use client';

import { ArrowUpRight, Play } from 'lucide-react';
import Link from 'next/link';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { localeHref, useLocale } from '@/lib/i18n';

import { listProviders } from '@/providers/registry';

const tones = ['bg-primary/20', 'bg-secondary', 'bg-muted', 'bg-accent/30'];
const providers = listProviders().map((provider, index) => ({
  ...provider,
  label: provider.id === 'vega' ? 'Primary catalog' : 'Streaming provider',
  tone: tones[index % tones.length],
}));

export function ProviderRail() {
  const { locale } = useLocale();

  return (
    <AnimatedSection stagger className="provider-root mt-12" aria-labelledby="providers-heading">
      <SectionHeader
        eyebrow="Explore by service"
        heading="Streaming providers"
        headingId="providers-heading"
        trailing={
          <Link
            href={localeHref(locale, '/search')}
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            View all <ArrowUpRight className="size-4" />
          </Link>
        }
        className="mb-4"
      />
      <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {providers.map((provider) => (
          <Link
            key={provider.name}
            href={localeHref(locale, `/?provider=${encodeURIComponent(provider.id)}`)}
            className={`provider-tile group relative flex min-h-24 w-44 shrink-0 snap-start items-end overflow-hidden rounded-xl border border-border/70 p-4 ${provider.tone} transition duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
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
    </AnimatedSection>
  );
}
