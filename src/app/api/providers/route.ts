import { NextResponse } from 'next/server';
import { listProviders } from '@/providers/registry';
import type { ProviderSummary } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const providers: ProviderSummary[] = listProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    catalogs: provider.catalog,
    hasEpisodes: Boolean(provider.getEpisodes),
  }));
  return NextResponse.json(providers);
}
