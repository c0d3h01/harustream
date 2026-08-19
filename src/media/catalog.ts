// Browse/discovery operations the catalog, featured, and meta API routes call.
// Each function validates its inputs (throwing a 400 ProviderError for missing
// params) and then delegates to the provider runtime. Routes stay thin: they
// parse the request, call in here, and shape the HTTP response.

import {
  type Category,
  type FeaturedRail,
  featuredFeedAll,
  featuredFeedFor,
  getCategories,
  getMetaInfo,
  type MetaInfo,
} from '@/providers';
import { ProviderError } from '@/providers/errors';

// GET /api/catalog — the provider's category list ({ title, filter } rails
// plus genre filters). The filter doubles as a search prefix.
export async function getCatalogCategories(provider: string): Promise<Category[]> {
  if (!provider.trim()) {
    throw new ProviderError(400, 'Missing provider parameter', 'BAD_GATEWAY');
  }
  return getCategories(provider);
}

// GET /api/media — full metadata for a single title. `link` is the provider
// link (a relative URL full of slashes), so it travels as a query param and
// the legacy path form is still accepted by the route.
export async function getMediaMeta(
  link: string,
  provider: string,
  signal?: AbortSignal,
): Promise<MetaInfo> {
  if (!link.trim()) {
    throw new ProviderError(400, 'Missing link parameter', 'BAD_GATEWAY');
  }
  if (!provider.trim()) {
    throw new ProviderError(400, 'Missing provider parameter', 'BAD_GATEWAY');
  }
  return getMetaInfo(provider, link, signal);
}

// GET /api/featured — the home rails (featured / newest / movies / series).
// With a provider the feed is built from that provider's catalog; without one
// it fans out across every executable provider server-side and merges the
// results. `preferred` only reorders the fan-out so the default channel's
// content leads each rail.
export async function getFeaturedFeed(
  provider?: string,
  preferred?: string,
  signal?: AbortSignal,
): Promise<FeaturedRail> {
  return provider ? featuredFeedFor(provider, signal) : featuredFeedAll(signal, preferred);
}
