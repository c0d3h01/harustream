import { Film, Play, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ViewTransition } from 'react';
import { encodeBase64Url } from '@/lib/base64url';
import { tmdbPath } from '@/lib/routes';
import type { TmdbCard } from '@/tmdb/catalog';
import { tmdbImageUrl } from '@/tmdb/images';

function imgUrl(src: string): string {
  if (src.startsWith('/')) return src;
  return `/api/image/${encodeBase64Url(src)}`;
}

interface TmdbMediaCardProps {
  card: TmdbCard;
  priority?: boolean;
  sharePoster?: boolean;
}

export function TmdbMediaCard({ card, priority = false, sharePoster = false }: TmdbMediaCardProps) {
  const poster = card.posterPath ? tmdbImageUrl(card.posterPath, 'w342') : undefined;
  const posterImage = poster ? (
    <Image
      src={imgUrl(poster)}
      alt={`${card.title} poster`}
      fill
      priority={priority}
      sizes="(min-width: 1024px) 202px, (min-width: 640px) 176px, 138px"
      className="object-cover"
    />
  ) : (
    <div className="absolute inset-0 grid place-items-center text-muted-foreground">
      <Film className="size-8 opacity-60" aria-hidden="true" />
    </div>
  );

  return (
    <div className="min-w-0">
      <Link
        href={tmdbPath(card.kind, card.tmdbId)}
        prefetch={priority}
        transitionTypes={['nav-forward']}
        aria-label={card.title}
        className="group block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-card shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.5)] motion-reduce:transition-none">
          {sharePoster ? (
            <ViewTransition
              name={`tmdb-poster-${card.kind}-${card.tmdbId}`}
              share="morph"
              default="none"
            >
              {posterImage}
            </ViewTransition>
          ) : (
            posterImage
          )}
          <div className="absolute inset-x-0 bottom-0 translate-y-1 bg-linear-to-t from-black/85 via-black/40 to-transparent px-2.5 pt-8 pb-2 opacity-0 transition duration-300 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100">
            {card.year || card.rating > 0 ? (
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] text-white/70">
                {card.year ? <span>{card.year}</span> : null}
                {card.rating > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3 fill-primary text-primary" aria-hidden="true" />
                    {card.rating.toFixed(1)}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <span
            className="pointer-events-none absolute inset-0 grid scale-90 place-items-center opacity-0 transition duration-300 group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:scale-100 motion-reduce:transition-none [@media(hover:hover)]:group-hover:scale-100 [@media(hover:hover)]:group-hover:opacity-100"
            aria-hidden="true"
          >
            <span className="grid size-11 place-items-center rounded-full bg-white text-black">
              <Play className="size-4.5 fill-current" />
            </span>
          </span>
        </div>
        <p className="truncate px-1 pt-2 text-[13px] font-semibold leading-relaxed text-foreground">
          {card.title}
        </p>
      </Link>
    </div>
  );
}
