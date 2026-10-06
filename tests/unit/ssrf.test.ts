import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { assertPublicUrl, isBlockedHost } from '@/lib/net/ssrf';

describe('isBlockedHost', () => {
  for (const host of [
    '127.0.0.1',
    '10.0.0.1',
    '10.255.255.255',
    '192.168.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '172.16.0.1',
    '::',
    '::1',
    '0:0:0:0:0:0:0:0',
    '0:0:0:0:0:0:0:1',
    'fe80::1',
    'fc00::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    'localhost',
    'LOCALHOST',
    'localhost.',
    'foo.internal',
    'example.internal.',
    'example.local',
  ]) {
    it(`blocks ${host}`, () => {
      assert.equal(isBlockedHost(host), true);
    });
  }

  for (const host of [
    '8.8.8.8',
    '1.1.1.1',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8',
    'example.com',
    'example.com.',
    'cdn.example',
  ]) {
    it(`allows ${host}`, () => {
      assert.equal(isBlockedHost(host), false);
    });
  }
});

describe('assertPublicUrl', () => {
  it('throws for blocked hosts', () => {
    assert.throws(() => assertPublicUrl(new URL('http://127.0.0.1/video.m3u8')));
    assert.throws(() => assertPublicUrl(new URL('http://[::1]/video.m3u8')));
    assert.throws(() => assertPublicUrl(new URL('http://foo.internal/video.m3u8')));
  });

  it('throws for non-http(s) targets and credentials', () => {
    assert.throws(() => assertPublicUrl(new URL('ftp://example.com/x')));
    assert.throws(() => assertPublicUrl(new URL('https://user:pass@example.com/x')));
  });

  it('passes for public targets', () => {
    assertPublicUrl(new URL('https://example.com/video.m3u8'));
    assertPublicUrl(new URL('https://8.8.8.8/video.m3u8'));
  });
});
