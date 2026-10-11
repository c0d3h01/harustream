/**
 * The visitor's own browser values. Nothing here is invented: if we do not know
 * a value, it stays absent and the caller omits the field rather than sending a
 * fixed one. Providers key catalogue and playback off these (timezone, locale),
 * so a hardcoded value would tell every visitor they are somewhere they are not.
 */
export const TIMEZONE_COOKIE = 'haru-tz';

export interface Viewer {
  userAgent?: string;
  acceptLanguage?: string;
  timeZone?: string;
}

// IANA shape only (`Area/City`, optionally `Area/City/Zone`). Anything else is
// dropped so a tampered cookie cannot inject header content.
const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,2}$/;

function sanitizeTimezone(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  return TIMEZONE_PATTERN.test(value) ? value : undefined;
}

/** Viewer values for a route handler, straight off the incoming request. */
export function viewerFromRequest(request: Request): Viewer {
  const fromCookie = /(?:^|;\s*)haru-tz=([^;]*)/.exec(request.headers.get('cookie') ?? '')?.[1];
  return {
    userAgent: request.headers.get('user-agent')?.trim() || undefined,
    acceptLanguage: request.headers.get('accept-language')?.trim() || undefined,
    timeZone: sanitizeTimezone(fromCookie),
  };
}

/**
 * Viewer values during a server render. Outside a request scope (unit tests,
 * scripts) there is no visitor, so this resolves to an empty viewer.
 */
export async function viewer(): Promise<Viewer> {
  try {
    const { cookies, headers } = await import('next/headers');
    const [requestHeaders, store] = await Promise.all([headers(), cookies()]);
    return {
      userAgent: requestHeaders.get('user-agent')?.trim() || undefined,
      acceptLanguage: requestHeaders.get('accept-language')?.trim() || undefined,
      timeZone: sanitizeTimezone(store.get(TIMEZONE_COOKIE)?.value),
    };
  } catch {
    return {};
  }
}
