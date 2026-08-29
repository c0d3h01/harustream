import { Suspense } from 'react';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { HomeHero } from '@/components/home/HomeHero';
import { ProviderRail } from '@/components/home/ProviderRail';
import { Rails } from '@/components/home/Rails';
import { Shell } from '@/components/layout/Shell';
import { featured } from '@/services/catalog';

export const dynamic = 'force-dynamic';

async function FeaturedRails({ provider }: { provider?: string }) {
  const { rails } = await featured(provider);
  return <Rails rails={rails} />;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const { provider } = await searchParams;

  return (
    <Shell>
      <HomeHero />
      <ContinueWatching />
      <ProviderRail />
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-secondary" />}>
        <FeaturedRails provider={provider} />
      </Suspense>
    </Shell>
  );
}
