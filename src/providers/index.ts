// Provider runtime entry point: the execution library the Next.js API route
// handlers import. Every single-provider operation executes the provider's
// dist/ module in the node:vm sandbox; multi-provider fan-out (search,
// featured) runs here with bounded concurrency and a deadline.

export { ProviderError } from './errors';
export {
  featuredFeedAll,
  mergePostsByTitle,
  runWithConcurrency,
  searchAll,
} from './fanout';
export { isProviderRuntimeConfigured, PROVIDER_MANIFEST_URL } from './registry/config';
export { getExecutableProviders, getProviders, providerById } from './registry/manifest';
export type {
  Category,
  Episode,
  FeaturedRail,
  MetaInfo,
  Post,
  Stream,
} from './runtime';
export {
  featuredFeedFor,
  getCategories,
  getEpisodeLinks,
  getMetaInfo,
  getPosts,
  getStreams,
  searchProvider,
} from './runtime';
