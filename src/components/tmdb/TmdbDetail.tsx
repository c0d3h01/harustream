import { Calendar, Clock, Film, Languages, Layers, Star, TrendingUp, Wallet } from 'lucide-react';
import Image from 'next/image';
import { MediaCard } from '@/components/ui/MediaCard';
import { imgUrl } from '@/lib/media';
import { tmdbPath } from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { TmdbCard, TmdbDetail as TmdbDetailData } from '@/tmdb/catalog';
import { tmdbImageUrl } from '@/tmdb/images';
import { SourcePicker } from '../sources/SourcePicker';
import {
  BackButton,
  DetailSaveButton,
  ExpandableOverview,
  PlayScrollButton,
  TrailerButton,
} from './DetailActions';

interface TmdbDetailProps {
  detail: TmdbDetailData;
  collectionParts?: TmdbCard[];
}

function money(value?: number): string | undefined {
  if (!value || value <= 0) return undefined;
  return `$${value.toLocaleString('en-US')}`;
}

export function TmdbDetail({ detail, collectionParts = [] }: TmdbDetailProps) {
  const { kind, tmdbId } = detail;

  const coreFacts: { icon: typeof Calendar; label: string; value: string }[] = [];
  if (detail.dateLabel)
    coreFacts.push({ icon: Calendar, label: 'Release', value: detail.dateLabel });
  if (detail.runtime) coreFacts.push({ icon: Clock, label: 'Runtime', value: detail.runtime });
  if (detail.seasons)
    coreFacts.push({ icon: Layers, label: 'Seasons', value: String(detail.seasons) });
  if (detail.language)
    coreFacts.push({ icon: Languages, label: 'Language', value: detail.language });
  const moneyFacts: { icon: typeof Wallet; label: string; value: string }[] = [];
  const budget = money(detail.budget);
  if (budget) moneyFacts.push({ icon: Wallet, label: 'Budget', value: budget });
  const revenue = money(detail.revenue);
  if (revenue) moneyFacts.push({ icon: TrendingUp, label: 'Revenue', value: revenue });

  const recommendations = detail.recommendations.slice(0, 12);
  const parts = collectionParts.slice(0, 12);
  const cast = detail.cast.slice(0, 18);
  const trailer = detail.trailers[0];

  const studioLogos = detail.companies.filter((c) => c.logoPath).slice(0, 4);
  const hasFacts = coreFacts.length > 0 || moneyFacts.length > 0;

  return (
    <div className="min-w-0">
      <div className="content-gutter">
        <BackButton />
      </div>

      <section
        className={cn(
          'hero-root relative w-full overflow-hidden',
          detail.backdropPath && 'flex min-h-[68svh]',
        )}
        aria-labelledby="title-heading"
      >
        {detail.backdropPath ? (
          <div className="backdrop-fade-b absolute inset-0" aria-hidden="true">
            <Image
              src={imgUrl(tmdbImageUrl(detail.backdropPath, 'w1280'))}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-top"
            />
            <div className="grain absolute inset-0" />
          </div>
        ) : null}

        <div
          className={cn(
            'hero-inner relative mx-auto w-full max-w-[1600px] px-5 pt-14 pb-40 sm:px-10 sm:pt-20 sm:pb-48 lg:px-16',
            detail.backdropPath && 'mt-auto',
          )}
        >
          <div className="max-w-2xl [text-shadow:0_1px_12px_rgba(0,0,0,0.65)]">
            <p className="font-mono text-[11px] font-medium tracking-[0.22em] text-foreground/70 uppercase">
              {kind === 'movie' ? 'Movie' : 'Series'}
              {detail.year ? `, ${detail.year}` : ''}
            </p>
            {detail.logoPath ? (
              <div className="relative mt-3 h-24 w-60 sm:h-32 sm:w-80" aria-hidden="true">
                <Image
                  src={imgUrl(tmdbImageUrl(detail.logoPath, 'w500'))}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 640px) 20rem, 15rem"
                  className="object-contain object-left brightness-0 invert"
                />
              </div>
            ) : null}
            <h1
              id="title-heading"
              className={cn(
                'max-w-[20ch] font-heading text-4xl tracking-[-0.04em] text-balance sm:text-6xl',
                'leading-[0.95]',
                detail.logoPath ? 'sr-only' : 'mt-3',
              )}
            >
              {detail.title}
            </h1>

            {detail.genres.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Genres">
                {detail.genres.slice(0, 3).map((genre) => (
                  <li
                    key={genre}
                    className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-secondary-foreground"
                  >
                    {genre}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px] font-medium">
              {detail.rating > 0 ? (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Star className="size-4 fill-primary text-primary" aria-hidden="true" />
                  {detail.rating.toFixed(1)}
                  <span className="font-normal text-muted-foreground">/10</span>
                </span>
              ) : null}
              {detail.runtime ? (
                <span className="font-mono text-sm text-muted-foreground tabular-nums">
                  {detail.runtime}
                </span>
              ) : null}
              {detail.seasons ? (
                <span className="font-mono text-sm text-muted-foreground tabular-nums">
                  {detail.seasons} {detail.seasons === 1 ? 'Season' : 'Seasons'}
                </span>
              ) : null}
            </p>
            {detail.director ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {'Directed by'}{' '}
                <span className="font-medium text-foreground">{detail.director}</span>
              </p>
            ) : null}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <PlayScrollButton />
              {trailer ? <TrailerButton trailer={trailer} /> : null}
              <DetailSaveButton
                kind={kind}
                tmdbId={tmdbId}
                title={detail.title}
                posterPath={detail.posterPath}
              />
            </div>

            {detail.overview ? <ExpandableOverview overview={detail.overview} /> : null}
          </div>
        </div>
      </section>

      <div className="content-gutter">
        {hasFacts || detail.collection || studioLogos.length > 0 ? (
          <div className="relative z-10 -mt-28 w-full rounded-xl border border-border bg-card p-5 sm:p-6">
            <aside aria-label={`${detail.title} facts`}>
              {coreFacts.length > 0 ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
                  {coreFacts.map((fact) => (
                    <div key={fact.label} className="min-w-0">
                      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <fact.icon className="size-3.5 shrink-0" aria-hidden="true" />
                        {fact.label}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {moneyFacts.length > 0 ? (
                <div
                  className={cn(
                    'grid grid-cols-2 gap-4',
                    coreFacts.length > 0 && 'mt-5 border-t border-border pt-5',
                  )}
                >
                  {moneyFacts.map((fact) => (
                    <div key={fact.label} className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <fact.icon className="size-3.5 shrink-0" aria-hidden="true" />
                        {fact.label}
                      </p>
                      <p className="mt-1.5 font-mono text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
                        {fact.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              {detail.collection ? (
                <div
                  className={cn(
                    'flex items-center gap-2.5',
                    hasFacts && 'mt-5 border-t border-border pt-4',
                  )}
                >
                  <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p className="truncate text-sm">
                    <span className="text-muted-foreground">{'Part of '}</span>
                    <span className="font-medium" title={detail.collection.name}>
                      {detail.collection.name}
                    </span>
                  </p>
                </div>
              ) : null}
              {studioLogos.length > 0 ? (
                <div className="mt-4 flex items-center gap-5 border-t border-border pt-4">
                  {studioLogos.map((studio) => (
                    <span key={studio.name} className="relative h-6 w-20" title={studio.name}>
                      <Image
                        src={imgUrl(tmdbImageUrl(studio.logoPath, 'w185'))}
                        alt={studio.name}
                        fill
                        sizes="5rem"
                        className="object-contain object-left opacity-60 grayscale"
                      />
                    </span>
                  ))}
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}

        <div className="mt-12 scroll-mt-20 sm:mt-16">
          <section aria-labelledby="tmdb-sources">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2
                  id="tmdb-sources"
                  className="font-heading text-[1.75rem] leading-tight tracking-[-0.01em] text-balance"
                >
                  {'Available on'}
                </h2>
              </div>
            </div>
            <SourcePicker
              kind={kind}
              tmdbId={tmdbId}
              title={detail.title}
              originalTitle={detail.originalTitle}
              year={detail.year}
              fallbackPosterUrl={
                detail.posterPath ? tmdbImageUrl(detail.posterPath, 'w342') : undefined
              }
              presentation="inline"
            />
          </section>
        </div>

        {cast.length > 0 ? (
          <div className="mt-12 sm:mt-16">
            <section aria-labelledby="tmdb-cast">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2
                    id="tmdb-cast"
                    className="font-heading text-[1.75rem] leading-tight tracking-[-0.01em] text-balance"
                  >
                    {'Cast'}
                  </h2>
                </div>
                <div className="shrink-0">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {cast.length}
                  </span>
                </div>
              </div>
              <div className="scrollbar-none flex min-w-0 snap-x snap-proximity gap-3 overflow-x-auto px-0.5 py-1 sm:gap-4 contain-paint [content-visibility:auto] [contain-intrinsic-size:auto_250px]">
                {cast.map((member) => {
                  const photo = tmdbImageUrl(member.profilePath, 'w185');
                  return (
                    <div key={member.id} className="w-28 shrink-0 snap-start sm:w-32">
                      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-border bg-muted">
                        {photo ? (
                          <Image
                            src={imgUrl(photo)}
                            alt={member.name}
                            fill
                            sizes="(min-width: 640px) 8rem, 7rem"
                            className="object-cover"
                          />
                        ) : (
                          <div
                            className="absolute inset-0 grid place-items-center text-muted-foreground"
                            aria-hidden="true"
                          >
                            <Film className="size-6 opacity-40" />
                          </div>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-[13px] leading-snug font-semibold">
                        {member.name}
                      </p>
                      {member.character ? (
                        <p className="truncate text-xs text-muted-foreground">{member.character}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}

        {parts.length > 0 && detail.collection ? (
          <div className="mt-12 sm:mt-16">
            <section aria-labelledby="tmdb-collection">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2
                    id="tmdb-collection"
                    className="font-heading text-[1.75rem] leading-tight tracking-[-0.01em] text-balance"
                  >
                    {detail.collection.name}
                  </h2>
                </div>
                <div className="shrink-0">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {parts.length}
                  </span>
                </div>
              </div>
              <div className="scrollbar-none flex min-w-0 snap-x snap-proximity gap-3 overflow-x-auto px-0.5 py-1 sm:gap-4 contain-paint [content-visibility:auto] [contain-intrinsic-size:auto_250px]">
                {parts.map((card) => (
                  <CardWithDedupe key={`${card.kind}:${card.tmdbId}`} card={card} />
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {recommendations.length > 0 ? (
          <div className="mt-12 sm:mt-16">
            <section aria-labelledby="tmdb-more-like">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2
                    id="tmdb-more-like"
                    className="font-heading text-[1.75rem] leading-tight tracking-[-0.01em] text-balance"
                  >
                    {'More like this'}
                  </h2>
                </div>
              </div>
              <div className="scrollbar-none flex min-w-0 snap-x snap-proximity gap-3 overflow-x-auto px-0.5 py-1 sm:gap-4 contain-paint [content-visibility:auto] [contain-intrinsic-size:auto_250px]">
                {recommendations.map((card) => (
                  <CardWithDedupe key={`${card.kind}:${card.tmdbId}`} card={card} />
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CardWithDedupe({ card }: { card: TmdbCard }) {
  return (
    <div className="w-[140px] shrink-0 snap-start">
      <MediaCard
        card={{
          key: `${card.kind}:${card.tmdbId}`,
          title: card.title,
          href: tmdbPath(card.kind, card.tmdbId),
          posterUrl: card.posterPath ? tmdbImageUrl(card.posterPath, 'w342') : undefined,
          year: card.year,
          rating: card.rating,
        }}
      />
    </div>
  );
}
