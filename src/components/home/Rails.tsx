import type { FeaturedRail } from '@/types';
import { Card } from './Card';

export function Rails({ rails }: { rails: FeaturedRail[] }) {
  return (
    <div className="mt-10 space-y-10">
      {rails.map((rail) => (
        <section key={rail.title} aria-labelledby={`rail-${rail.title}`}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Curated rail
              </p>
              <h2 id={`rail-${rail.title}`} className="mt-1 text-xl font-semibold tracking-tight">
                {rail.title}
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">{rail.items.length} titles</span>
          </div>
          <div className="grid grid-flow-col auto-cols-[minmax(140px,170px)] gap-3 overflow-x-auto pb-3 sm:auto-cols-[170px] sm:gap-4">
            {rail.items.map((item, index) => (
              <Card key={item.id} item={item} priority={index < 4} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
