import { Suspense } from 'react';
import { ContinueWatchingRail } from '@/components/home/ContinueWatchingRail';
import { FeaturedRails } from '@/components/home/FeaturedRails';
import { HomeHero } from '@/components/home/HomeHero';
import { ProviderRail } from '@/components/home/ProviderRail';
import { Shell } from '@/components/layout/Shell';
import { featured } from '@/services/catalog';

export const dynamic = 'force-dynamic';

async function FeaturedRailsLoader({ provider }: { provider?: string }) {
  const { rails } = await featured(provider);
  return <FeaturedRails rails={rails} />;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const { provider } = await searchParams;

  return (
    <Shell>
      <div className="pt-2">
        <HomeHero />
        <ProviderRail />
        <ContinueWatchingRail />
        <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-secondary" />}>
          <FeaturedRailsLoader provider={provider} />
        </Suspense>
      </div>
    </Shell>
  );
}
