// ─── Shared Provider Exports ────────────────────────────────────────────────
// Re-export everything a provider module needs from one place.
//
// Usage in provider code:
//   import { providerBaseUrl, providerName, throwProviderError, ... } from '../_shared';
//   import type { ProviderModule, ProviderContext, Stream, ... } from '../_shared';

// Types
export type {
  ProviderUrls,
  RawPost,
  RawTextTrack,
  RawStream,
  RawInfo,
  RawEpisodeLink,
  RawLinkSource,
  RawLink,
  ProviderKvStore,
  OpenWebViewOptions,
  OpenWebViewResult,
  ProviderContext,
  ProviderModule,
  ProviderSummaryKind,
  SettingsField,
  Post,
  Stream,
  Info,
  EpisodeLink,
  Link,
  TextTracks,
  SkipInterval,
  Catalog,
} from './types';

// Runtime helpers
export { providerBaseUrl, providerName, providerManifest } from './urls';
export { createProviderContext, openWebView, commonHeaders } from './context';
export { throwProviderError } from './errors';
