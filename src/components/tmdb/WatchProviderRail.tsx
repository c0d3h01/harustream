'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import type { TmdbKind, TmdbWatchProvider } from '@/tmdb/catalog';
import { tmdbImageUrl } from '@/tmdb/images';

interface WatchProviderRailProps {
  kind: TmdbKind;
  providers: TmdbWatchProvider[];
}

/** Browse-by-provider row — TMDB streaming-service logos (replaces the old
 *  scraper-provider menu). Tiles open a discover grid for that service. */
export function WatchProviderRail({ kind, providers }: WatchProviderRailProps) {
  const t = useT();
  const { locale } = useLocale();
  if (providers.length === 0) return null;
  return (
    <AnimatedSection
      stagger
      className="provider-root mt-12"
      aria-labelledby="watch-providers-heading"
    >
      <SectionHeader
        eyebrow={t('tmdb.providersEyebrow')}
        heading={t('tmdb.providersHeading')}
        headingId="watch-providers-heading"
        className="mb-4"
      />
      <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {providers.map((provider) => (
          <Link
            key={provider.id}
            href={localeHref(locale, `/browse/${kind}/${provider.id}`)}
            scroll={false}
            className="provider-tile group relative flex min-h-24 w-44 shrink-0 snap-start items-end overflow-hidden rounded-xl border border-border/70 bg-secondary p-4 transition duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 active:scale-[0.97] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {provider.logoPath ? (
              <Image
                src={imageUrl(tmdbImageUrl(provider.logoPath, 'w185'))}
                alt=""
                width={44}
                height={44}
                className="absolute right-3 top-3 size-11 rounded-lg object-cover"
              />
            ) : null}
            <p className="text-lg font-black tracking-[-0.06em] text-foreground">{provider.name}</p>
          </Link>
        ))}
      </div>
    </AnimatedSection>
  );
}
