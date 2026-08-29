import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyTokensEnabled, signProxyTarget, verifyProxyTarget } from '@/lib/media/proxyToken';

const SECRET = 'unit-test-secret';

// Test-scoped signer: fails loudly when the env stub didn't take effect,
// so the assertions below never have to reason about nullability.
function sign(url: string, headers?: Parameters<typeof signProxyTarget>[1]) {
  const signed = signProxyTarget(url, headers);
  if (!signed) throw new Error('STREAM_PROXY_SECRET stub missing — signing is disabled');
  return signed;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy target signing', () => {
  it('is disabled and permissive when no secret is configured', () => {
    expect(proxyTokensEnabled()).toBe(false);
    expect(
      signProxyTarget('https://cdn.test/video.m3u8', { referer: 'https://p.test' }),
    ).toBeNull();
    // Unsigned requests pass through while the feature is off (local dev).
    expect(verifyProxyTarget('https://cdn.test/x', undefined, null, null)).toBe(true);
  });

  it('accepts a round-tripped signature', () => {
    vi.stubEnv('STREAM_PROXY_SECRET', SECRET);
    const headers = { referer: 'https://provider.test', userAgent: 'Test UA' };
    const url = 'https://cdn.test/video.mp4?tok=1';
    const { sig, exp } = sign(url, headers);
    expect(verifyProxyTarget(url, headers, sig, String(exp))).toBe(true);
  });

  it('rejects tampered URLs, header swaps, signatures, and expiry', () => {
    vi.stubEnv('STREAM_PROXY_SECRET', SECRET);
    const url = 'https://cdn.test/a.m3u8';
    const headers = { referer: 'https://provider.test' };
    const { sig, exp } = sign(url, headers);

    expect(verifyProxyTarget('https://cdn.test/other.m3u8', headers, sig, String(exp))).toBe(false);
    expect(verifyProxyTarget(url, { referer: 'https://evil.test' }, sig, String(exp))).toBe(false);
    expect(verifyProxyTarget(url, undefined, sig, String(exp))).toBe(false);
    expect(verifyProxyTarget(url, headers, `${sig}0`, String(exp))).toBe(false);
    expect(verifyProxyTarget(url, headers, undefined, String(exp))).toBe(false);
  });

  it('rejects expired targets but honors trimmed runtime values', () => {
    vi.stubEnv('STREAM_PROXY_SECRET', SECRET);
    const headers = { cookie: ' sid=1; theme=dark ' };
    const url = 'https://cdn.test/v.mp4';
    const { sig, exp } = sign(url, headers);
    expect(exp).toBeGreaterThan(Date.now() / 1000);

    // Expired one tick past exp.
    const expiredMs = exp * 1000 + 1000;
    expect(verifyProxyTarget(url, headers, sig, String(exp), expiredMs)).toBe(false);
    // Canonicalization trims header values identically on both sides.
    expect(verifyProxyTarget(url, { cookie: 'sid=1; theme=dark' }, sig, String(exp))).toBe(true);
  });
});
