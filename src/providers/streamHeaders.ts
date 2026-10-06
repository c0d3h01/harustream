import { USER_AGENT } from './_shared/headers';
import { providerBaseUrl } from './_shared/urls';

function siteOrigin(providerId: string): string {
  return new URL(providerBaseUrl(providerId)).origin;
}

/**
 * Server-side identity for playback requests. Only the provider's own origin
 * is ours to set — whatever describes a *person* (user-agent, timezone) comes
 * from that person's browser, omitted when unknown.
 */
export function providerStreamHeaders(
  providerId: string,
  _target: URL,
  viewer: { userAgent?: string; acceptLanguage?: string; timeZone?: string } = {},
): Record<string, string> {
  const headers =
    providerId === 'movieBoxWeb'
      ? {
          Referer: siteOrigin(providerId),
          Origin: siteOrigin(providerId),
          ...(viewer.timeZone
            ? { 'x-client-info': JSON.stringify({ timezone: viewer.timeZone }) }
            : {}),
        }
      : {};
  return {
    'User-Agent': viewer.userAgent || USER_AGENT,
    ...(viewer.acceptLanguage ? { 'Accept-Language': viewer.acceptLanguage } : {}),
    ...headers,
  };
}
