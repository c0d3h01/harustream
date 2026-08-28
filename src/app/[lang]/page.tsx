import { Suspense } from 'react';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { HomeHero } from '@/components/home/HomeHero';
import { ProviderRail } from '@/components/home/ProviderRail';
import { Rails } from '@/components/home/Rails';
import { Shell } from '@/components/layout/Shell';
import { featured } from '@/services/catalog';

export const dynamic = 'force-dynamic';

async function FeaturedRails() {
  const { rails } = await featured();
  return <Rails rails={rails} />;
}

export default function Home() {
  return (
    <Shell>
      <HomeHero />
      <ContinueWatching />
      <ProviderRail />
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-secondary" />}>
        <FeaturedRails />
      </Suspense>
    </Shell>
  );
}
