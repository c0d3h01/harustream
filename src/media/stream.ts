// Stream resolution for GET /api/stream. `hub` is a link from
// meta.linkList (movies) or an episode link (series); the provider's stream
// module follows it and returns the playable sources.

import { getStreams, type Stream } from '@/providers';
import { ProviderError } from '@/providers/errors';

export async function getStreamSources(
  hub: string,
  type: string,
  provider: string,
  signal?: AbortSignal,
): Promise<Stream[]> {
  if (!hub.trim()) {
    throw new ProviderError(400, 'Missing hub parameter', 'BAD_GATEWAY');
  }
  if (!provider.trim()) {
    throw new ProviderError(400, 'Missing provider parameter', 'BAD_GATEWAY');
  }
  return getStreams(provider, hub, type, signal);
}
