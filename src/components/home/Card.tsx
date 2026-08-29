'use client';

import { Film, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { memo, useMemo } from 'react';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { encodeRef } from '@/lib/refs';
import type { SearchResult } from '@/types';

interface CardProps {
  item: SearchResult;
  priority?: boolean;
  rank?: number;
}

function CardInner({ item, priority = false, rank }: CardProps) {
  const t = useT();
  const { locale } = useLocale();

  const href = useMemo(
    () => localeHref(locale, `/title/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}`),
    [item.providerId, item.ref, locale],
  );

  const kind = useMemo(
    () => item.title.toLowerCase().includes('season') ? t('kind.series') : t('kind.movie'),
    [item.title, t],
  );

  const posterAlt = useMemo(
    () => t('home.posterAlt', { title: item.displayTitle }),
    [item.displayTitle, t],
  );

  return (
    <Link
      href={href}
      className="group block min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card text-left shadow-xs transition duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-2/3 overflow-hidden bg-secondary">
        {rank ? (
          <span
            className="absolute bottom-1 left-2 z-10 text-6xl font-black leading-none text-foreground/90 drop-shadow-lg"
            aria-label={`${t('home.rank')} ${rank}`}
          >
            {rank}
          </span>
        ) : null}
        {item.posterUrl ? (
          <Image
            src={imageUrl(item.posterUrl)}
            alt={posterAlt}
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
        <span
          className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition group-hover:opacity-100"
          aria-hidden="true"
        >
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

export const Card = memo(CardInner, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.displayTitle === next.item.displayTitle &&
    prev.item.providerName === next.item.providerName &&
    prev.item.providerId === next.item.providerId &&
    prev.item.ref === next.item.ref &&
    prev.item.posterUrl === next.item.posterUrl &&
    prev.priority === next.priority &&
    prev.rank === next.rank
  );
});