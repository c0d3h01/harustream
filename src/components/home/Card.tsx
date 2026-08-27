'use client';

import { Film, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { encodeRef } from '@/lib/refs';
import type { SearchResult } from '@/types';

export function Card({ item, priority = false }: { item: SearchResult; priority?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  // Same heuristic the Moviesmod meta parser uses; upstream search results
  // carry no kind field, so this is the best available signal.
  const kind = item.title.toLowerCase().includes('season') ? t('kind.series') : t('kind.movie');
  return (
    <Link
      href={localeHref(
        locale,
        `/title/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}`,
      )}
      className="group block min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-xs transition hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-2/3 overflow-hidden bg-secondary">
        {item.posterUrl ? (
          <Image
            src={imageUrl(item.posterUrl)}
            alt={t('home.posterAlt', { title: item.displayTitle })}
            fill
            priority={priority}
            sizes="(min-width: 1280px) 170px, (min-width: 1024px) 14vw, (min-width: 640px) 30vw, 42vw"
            className="object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Film className="size-8 opacity-60" aria-hidden="true" />
          </div>
        )}
        <span className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition group-hover:opacity-100">
          <Play className="size-4 fill-current" aria-hidden="true" />
        </span>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold">{item.displayTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.providerName} · {kind}
        </p>
      </div>
    </Link>
  );
}
