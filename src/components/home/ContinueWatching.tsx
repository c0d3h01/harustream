'use client';

import { Play, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { imageUrl } from '@/lib/media/images';
import { encodeRef } from '@/lib/refs';
import { useProgress } from '@/lib/storage';

export function ContinueWatching() {
  const movieBoxProgress = useProgress('movieBoxWeb');
  const moviesmodProgress = useProgress('Moviesmod');
  const anikotoProgress = useProgress('anikoto');
  const progress = [movieBoxProgress, moviesmodProgress, anikotoProgress];
  const items = progress
    .flatMap((entry) => entry.list)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 12);
  if (!items.length) return null;
  return (
    <section className="mt-8" aria-labelledby="continue-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="continue-heading" className="text-xl font-semibold tracking-tight">
          Continue watching
        </h2>
        <span className="text-xs text-muted-foreground">On this device</span>
      </div>
      <div className="grid grid-flow-col auto-cols-[150px] gap-3 overflow-x-auto pb-3">
        {items.map((item) => {
          const title = item.title ?? 'Untitled';
          const provider = item.provider ?? 'movieBoxWeb';
          const percentage = Math.round((item.position / item.duration) * 100);
          return (
            <div key={`${item.ref}:${item.episodeRef}`} className="relative">
              <Link
                href={`/watch/${encodeURIComponent(provider)}/${encodeRef(item.ref)}${
                  item.episodeRef ? `?episode=${encodeURIComponent(item.episodeRef)}` : ''
                }`}
                className="group block overflow-hidden rounded-2xl border border-border/70 bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative aspect-[2/3] bg-secondary">
                  {item.poster ? (
                    <Image
                      src={imageUrl(item.poster)}
                      alt={`${title} poster`}
                      fill
                      sizes="150px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground">
                      No poster
                    </div>
                  )}
                  <span className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 transition group-hover:opacity-100">
                    <Play className="size-3.5 fill-current" aria-hidden="true" />
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-1 text-xs font-semibold">{title}</p>
                  <div
                    className="mt-2 h-1 rounded-full bg-secondary"
                    role="progressbar"
                    aria-label={`${percentage}% watched`}
                    aria-valuenow={percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </Link>
              <button
                type="button"
                aria-label={`Remove ${title} from continue watching`}
                onClick={() =>
                  progress
                    .find((entry) => entry.list.some((saved) => saved.ref === item.ref))
                    ?.clear(item.ref, item.episodeRef)
                }
                className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition hover:bg-background group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
