'use client';

import { ArrowLeft, Check, Film, Plus, Star, Volume2, VolumeX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState, ViewTransition } from 'react';
import { SPRING } from '@/components/motion/transitions';
import { RailScroller } from '@/components/ui/rail';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { useLibrary } from '@/lib/storage';
import type { TmdbCard, TmdbDetail as TmdbDetailData, TmdbTrailer } from '@/tmdb/catalog';
import { tmdbImageUrl, youtubeEmbedUrl, youtubeThumbnail } from '@/tmdb/images';
import { TmdbMediaCard } from './TmdbMediaCard';
import { TmdbPicker } from './TmdbPicker';
import { TmdbPlayButton } from './TmdbPlayButton';
import { TrailerEmbed } from './TrailerEmbed';

interface TmdbDetailProps {
  detail: TmdbDetailData;
  collectionParts?: TmdbCard[];
}

function money(value?: number): string | undefined {
  if (!value || value <= 0) return undefined;
  return `$${value.toLocaleString('en-US')}`;
}

/** TMDB detail — static on render (no entrance). Backdrop + logo header,
 *  Play (auto-resolve) + save, meta panel, sources picker, cast, trailers,
 *  collection, recommendations. Only Play/picker touch providers. */
export function TmdbDetail({ detail, collectionParts = [] }: TmdbDetailProps) {
  const t = useT();
  const router = useRouter();
  const library = useLibrary('tmdb');
  const { kind, tmdbId } = detail;
  const ref = `${kind}:${tmdbId}`;
  const saved = library.has(ref);

  const saveItem = useMemo(
    () => ({
      id: `tmdb:${ref}`,
      providerId: 'tmdb',
      providerName: 'TMDB',
      title: detail.title,
      displayTitle: detail.title,
      posterUrl: tmdbImageUrl(detail.posterPath, 'w342'),
      ref,
      tmdbKind: kind,
      tmdbId,
      tmdbTitle: detail.title,
      tmdbPoster: tmdbImageUrl(detail.posterPath, 'w342'),
    }),
    [detail.title, detail.posterPath, kind, ref, tmdbId],
  );

  // First-occurrence-wins morph dedupe across recs + collection (same
  // pattern as the home rails — overlapping TMDB rails share titles).
  const seen = useMemo(() => new Set<string>([ref]), [ref]);
  const markSeen = (card: TmdbCard): boolean => {
    const key = `${card.kind}:${card.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const metaRows: { label: string; value: string }[] = [];
  if (detail.director) metaRows.push({ label: t('tmdb.director'), value: detail.director });
  if (detail.dateLabel) metaRows.push({ label: t('tmdb.release'), value: detail.dateLabel });
  if (detail.runtime) metaRows.push({ label: t('tmdb.runtime'), value: detail.runtime });
  if (detail.seasons) {
    metaRows.push({ label: t('tmdb.seasons'), value: String(detail.seasons) });
  }
  if (detail.language) metaRows.push({ label: t('tmdb.language'), value: detail.language });
  const budget = money(detail.budget);
  if (budget) metaRows.push({ label: t('tmdb.budget'), value: budget });
  const revenue = money(detail.revenue);
  if (revenue) metaRows.push({ label: t('tmdb.revenue'), value: revenue });

  const recommendations = detail.recommendations.slice(0, 12);
  const parts = collectionParts.slice(0, 12);

  // Header trailer: muted autoplay behind the info, unmuted on tap.
  // No trailer → the static backdrop photo stays (same as before).
  const trailerKey = detail.trailers[0]?.key;
  const [trailerMuted, setTrailerMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);
  // Info table reuses the translated meta rows (director gets its own line).
  const tableRows = metaRows.filter((row) => row.label !== t('tmdb.director'));
  const studioLogos = detail.companies.filter((c) => c.logoPath).slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label={t('tmdb.back')}
        className="glass-chip glass-interactive mb-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('tmdb.back')}
      </button>

      {/* ---------- header: full-bleed backdrop, content floats on it ---------- */}
      <section
        className="relative -mx-4 overflow-hidden sm:-mx-6 lg:-mx-10"
        aria-labelledby="title-heading"
      >
        {detail.backdropPath || trailerKey ? (
          <div className="absolute inset-0" aria-hidden="true">
            {detail.backdropPath ? (
              <Image
                src={imageUrl(tmdbImageUrl(detail.backdropPath, 'w1280'))}
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover object-top opacity-50"
              />
            ) : null}
            {trailerKey ? (
              <TrailerEmbed
                trailerKey={trailerKey}
                muted={trailerMuted}
                frameClassName="pointer-events-none absolute left-1/2 top-1/2 aspect-video w-full -translate-x-1/2 -translate-y-1/2"
                veilClassName="pointer-events-none absolute inset-0 bg-black/30"
              />
            ) : null}
            {/* Left grade for text, top for the sticky header, bottom melt. */}
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
          </div>
        ) : null}
        {trailerKey ? (
          <button
            type="button"
            onClick={() => setTrailerMuted((m) => !m)}
            aria-pressed={!trailerMuted}
            aria-label={trailerMuted ? t('tmdb.unmuteTrailer') : t('tmdb.muteTrailer')}
            className="glass-chip absolute top-4 right-4 z-10 grid size-11 cursor-pointer place-items-center rounded-full text-foreground transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-10"
          >
            {trailerMuted ? (
              <VolumeX className="size-5" aria-hidden="true" />
            ) : (
              <Volume2 className="size-5" aria-hidden="true" />
            )}
          </button>
        ) : null}
        <div className="relative mx-auto grid max-w-[1440px] gap-10 px-4 pt-16 pb-12 sm:px-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:pt-24">
          <div className="min-w-0">
            {detail.logoPath ? (
              <div className="relative h-20 w-56 sm:h-24 sm:w-72" aria-hidden="true">
                <Image
                  src={imageUrl(tmdbImageUrl(detail.logoPath, 'w500'))}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 640px) 18rem, 14rem"
                  className="object-contain object-left"
                />
              </div>
            ) : null}
            <h1
              id="title-heading"
              className={
                detail.logoPath
                  ? 'sr-only'
                  : 'text-3xl font-bold tracking-tight text-balance sm:text-5xl'
              }
            >
              {detail.title}
            </h1>
            {detail.genres.length > 0 ? (
              <p className="mt-3 text-[15px] font-medium text-foreground/90">
                {detail.genres.slice(0, 3).join(' · ')}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <TmdbPlayButton
                kind={kind}
                tmdbId={tmdbId}
                title={detail.title}
                originalTitle={detail.originalTitle}
                year={detail.year}
                variant="hero"
              />
              <button
                type="button"
                onClick={() => library.toggle(saveItem)}
                aria-pressed={saved}
                aria-label={saved ? t('title.saved') : t('title.save')}
                className="glass-chip glass-interactive grid size-12 cursor-pointer place-items-center rounded-full text-foreground transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {saved ? (
                    <motion.span
                      key="saved"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={SPRING}
                      className="flex items-center"
                    >
                      <Check className="size-5" aria-hidden="true" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="unsaved"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={SPRING}
                      className="flex items-center"
                    >
                      <Plus className="size-5" aria-hidden="true" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>

            <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] font-medium">
              {detail.year ? <span>{detail.year}</span> : null}
              {detail.runtime ? <span className="text-foreground/80">{detail.runtime}</span> : null}
              {detail.rating > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />{' '}
                  {detail.rating.toFixed(1)}
                </span>
              ) : null}
            </p>
            {detail.director ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t('tmdb.director')}: <span className="text-foreground">{detail.director}</span>
              </p>
            ) : null}

            {detail.overview ? (
              <div className="mt-4 max-w-2xl">
                <p
                  className={[
                    'text-[15px] leading-relaxed text-foreground/80',
                    expanded ? '' : 'line-clamp-3',
                  ].join(' ')}
                >
                  {detail.overview}
                </p>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="mt-1.5 cursor-pointer text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {expanded ? t('tmdb.readLess') : t('tmdb.readMore')}
                </button>
              </div>
            ) : null}
          </div>

          {tableRows.length > 0 || detail.collection ? (
            <aside
              aria-label={detail.title}
              className="h-fit rounded-2xl border border-white/10 bg-black/50 p-5 lg:mt-24"
            >
              <dl className="divide-y divide-white/8">
                {tableRows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="shrink-0 text-sm text-muted-foreground">{row.label}</dt>
                    <dd className="truncate text-right text-sm font-medium">{row.value}</dd>
                  </div>
                ))}
                {detail.collection ? (
                  <div className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="shrink-0 text-sm text-muted-foreground">
                      {t('tmdb.collectionTitle')}
                    </dt>
                    <dd className="truncate text-right text-sm font-medium">
                      {detail.collection.name}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {studioLogos.length > 0 ? (
                <div className="mt-3 flex items-center gap-5 border-t border-white/8 pt-4">
                  {studioLogos.map((studio) => (
                    <span key={studio.name} className="relative h-6 w-20" title={studio.name}>
                      <Image
                        src={imageUrl(tmdbImageUrl(studio.logoPath, 'w185'))}
                        alt={studio.name}
                        fill
                        sizes="5rem"
                        className="object-contain object-left opacity-70 grayscale"
                      />
                    </span>
                  ))}
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      </section>

      {/* ---------- sources ---------- */}
      <section aria-labelledby="tmdb-sources" className="mt-10">
        <SectionHeader heading={t('tmdb.chooseSource')} headingId="tmdb-sources" className="mb-4" />
        <TmdbPicker
          kind={kind}
          tmdbId={tmdbId}
          title={detail.title}
          originalTitle={detail.originalTitle}
          year={detail.year}
        />
      </section>

      {/* ---------- cast ---------- */}
      {detail.cast.length > 0 ? (
        <section aria-labelledby="tmdb-cast" className="mt-10">
          <SectionHeader heading={t('tmdb.cast')} headingId="tmdb-cast" className="mb-4" />
          <RailScroller>
            {detail.cast.map((member) => {
              const photo = tmdbImageUrl(member.profilePath, 'w185');
              return (
                <div key={member.id} className="w-24 shrink-0 snap-start text-center sm:w-28">
                  <div className="relative mx-auto aspect-square w-24 overflow-hidden rounded-full border border-border/60 bg-secondary sm:w-28">
                    {photo ? (
                      <Image
                        src={imageUrl(photo)}
                        alt={member.name}
                        fill
                        sizes="(min-width: 640px) 7rem, 6rem"
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
                  <p className="mt-2 truncate text-xs font-semibold">{member.name}</p>
                  {member.character ? (
                    <p className="truncate text-[11px] text-muted-foreground">{member.character}</p>
                  ) : null}
                </div>
              );
            })}
          </RailScroller>
        </section>
      ) : null}

      {/* ---------- trailers ---------- */}
      {detail.trailers.length > 0 ? (
        <section aria-labelledby="tmdb-trailers" className="mt-10">
          <SectionHeader heading={t('tmdb.trailers')} headingId="tmdb-trailers" className="mb-4" />
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {detail.trailers.map((trailer) => (
              <TrailerCard key={trailer.id} trailer={trailer} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- collection ---------- */}
      {parts.length > 0 && detail.collection ? (
        <section aria-labelledby="tmdb-collection" className="mt-10">
          <SectionHeader
            heading={t('tmdb.collection', { name: detail.collection.name })}
            headingId="tmdb-collection"
            className="mb-4"
          />
          <RailScroller>
            {parts.map((card) => (
              <CardWithDedupe key={card.tmdbId} card={card} markSeen={markSeen} />
            ))}
          </RailScroller>
        </section>
      ) : null}

      {/* ---------- recommendations ---------- */}
      {recommendations.length > 0 ? (
        <section aria-labelledby="tmdb-more-like" className="mt-10">
          <SectionHeader heading={t('tmdb.moreLike')} headingId="tmdb-more-like" className="mb-4" />
          <RailScroller>
            {recommendations.map((card) => (
              <CardWithDedupe key={card.tmdbId} card={card} markSeen={markSeen} />
            ))}
          </RailScroller>
        </section>
      ) : null}
    </div>
  );
}

function CardWithDedupe({
  card,
  markSeen,
}: {
  card: TmdbCard;
  markSeen: (card: TmdbCard) => boolean;
}) {
  return (
    <ViewTransition key={`${card.kind}:${card.tmdbId}`}>
      <div className="w-[140px] shrink-0 snap-start">
        <TmdbMediaCard card={card} sharePoster={markSeen(card)} />
      </div>
    </ViewTransition>
  );
}

function TrailerCard({ trailer }: { trailer: TmdbTrailer }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <iframe
        title={trailer.name}
        src={`${youtubeEmbedUrl(trailer.key)}&autoplay=1`}
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full rounded-xl border border-border/60 bg-black"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-secondary text-left transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={trailer.name}
    >
      <Image
        src={imageUrl(youtubeThumbnail(trailer.key))}
        alt=""
        fill
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <span className="absolute bottom-2.5 left-3 right-3 truncate text-sm font-semibold text-white">
        {trailer.name}
      </span>
      <span className="glass-overlay absolute inset-0 m-auto grid size-12 place-items-center rounded-full text-white transition group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  );
}
