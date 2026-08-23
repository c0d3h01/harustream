import { Film, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { imageUrl } from '@/lib/media/images';
import { encodeRef } from '@/lib/refs';
import type { SearchResult } from '@/types';

export function Card({ item, priority = false }: { item: SearchResult; priority?: boolean }) {
  const kind = item.title.toLowerCase().includes('season') ? 'Series' : 'Movie';
  return (
    <Link
      href={`/title/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}`}
      className="group block min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-xs transition hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-secondary">
        {item.posterUrl ? (
          <Image
            src={imageUrl(item.posterUrl)}
            alt={`${item.title} poster`}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 170px, (min-width: 640px)  twentyvw, 42vw"
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
        <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.providerName} · {kind}
        </p>
      </div>
    </Link>
  );
}
