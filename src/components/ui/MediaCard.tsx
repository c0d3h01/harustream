import { Film, Play, Star, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ViewTransition } from 'react';
import { imgUrl } from '@/lib/media';

export interface MediaCardData {
  key: string;
  title: string;
  href: string;
  posterUrl?: string;
  transitionName?: string;
  year?: string;
  rating?: number;
  progress?: number;
  onRemove?: () => void;
}

interface MediaCardProps {
  card: MediaCardData;
  priority?: boolean;
  sharePoster?: boolean;
}

export function MediaCard({ card, priority = false, sharePoster = false }: MediaCardProps) {
  const poster = imgUrl(card.posterUrl);
  const rating = card.rating ?? 0;

  const posterImage = poster ? (
    <Image
      src={poster}
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
    <div className="group/card relative min-w-0">
      <Link
        href={card.href}
        prefetch={priority}
        transitionTypes={['nav-forward']}
        aria-label={card.title}
        className="group block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-card shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.5)] motion-reduce:transition-none">
          {sharePoster ? (
            <ViewTransition
              name={card.transitionName ?? `media-poster-${card.key}`}
              share="morph"
              default="none"
            >
              {posterImage}
            </ViewTransition>
          ) : (
            posterImage
          )}
          {card.year || rating > 0 ? (
            <div className="absolute inset-x-0 bottom-0 translate-y-1 bg-linear-to-t from-black/85 via-black/40 to-transparent px-2.5 pt-8 pb-2 opacity-0 transition duration-300 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100">
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] text-white/70">
                {card.year ? <span>{card.year}</span> : null}
                {rating > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3 fill-primary text-primary" aria-hidden="true" />
                    {rating.toFixed(1)}
                  </span>
                ) : null}
              </p>
            </div>
          ) : null}
          <span
            className="pointer-events-none absolute inset-0 grid scale-90 place-items-center opacity-0 transition duration-300 group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:scale-100 motion-reduce:transition-none [@media(hover:hover)]:group-hover:scale-100 [@media(hover:hover)]:group-hover:opacity-100"
            aria-hidden="true"
          >
            <span className="grid size-11 place-items-center rounded-full bg-white text-black">
              <Play className="size-4.5 fill-current" />
            </span>
          </span>
          {typeof card.progress === 'number' && card.progress > 0 ? (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.min(card.progress, 100)}%` }}
              />
            </div>
          ) : null}
        </div>
        <p className="truncate px-1 pt-2 text-[13px] font-semibold leading-relaxed text-foreground">
          {card.title}
        </p>
      </Link>
      {card.onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            card.onRemove?.();
          }}
          aria-label={`Remove ${card.title}`}
          className="absolute top-1.5 right-1.5 z-10 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition group-focus-visible/card:opacity-100 hover:bg-black/80 focus-visible:opacity-100 [@media(hover:hover)]:group-hover/card:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
