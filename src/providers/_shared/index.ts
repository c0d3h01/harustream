// ─── Shared Provider Exports ────────────────────────────────────────────────
// Re-export everything a provider module needs from one place.
//
// Usage in provider code:
//   import { providerBaseUrl, providerName, throwProviderError, ... } from '../_shared';
//   import type { ProviderModule, ProviderContext, Stream, ... } from '../_shared';

export { commonHeaders, createProviderContext, openWebView } from './context';
export { throwProviderError } from './errors';
// Types
export type {
  Catalog,
  EpisodeLink,
  Info,
  Link,
  OpenWebViewOptions,
  OpenWebViewResult,
  Post,
  ProviderContext,
  ProviderKvStore,
  ProviderModule,
  ProviderSummaryKind,
  ProviderUrls,
  RawEpisodeLink,
  RawInfo,
  RawLink,
  RawLinkSource,
  RawPost,
  RawStream,
  RawTextTrack,
  SettingsField,
  SkipInterval,
  Stream,
  TextTracks,
} from './types';
// Runtime helpers
export { isProviderRetired, providerBaseUrl, providerManifest, providerName } from './urls';
