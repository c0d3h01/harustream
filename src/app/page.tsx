import { ContinueWatching } from '@/components/home/ContinueWatching';
import { Rails } from '@/components/home/Rails';
import { Shell } from '@/components/layout/Shell';
import { featured } from '@/services/catalog';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { rails } = await featured();
  return (
    <Shell>
      <section className="pt-16 sm:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
          Your screen, your stream
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Find something worth watching.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          Browse across your providers, keep your watchlist local, and pick up where you left off.
        </p>
      </section>
      <ContinueWatching />
      <Rails rails={rails} />
    </Shell>
  );
}
