import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from '@/lib/base64url';

describe('opaque title references', () => {
  for (const value of [
    'https://themoviebox.org/moviesDetail/breaking-bad',
    '火影忍者 — Naruto',
    '{"subjectId":"6207982430134357800","detailPath":"breaking-bad-ej6Bp0MCAo7","language":"Original Audio"}',
  ]) {
    it(`round trips ${value}`, () => {
      const encoded = encodeBase64Url(value);
      assert.ok(!encoded.includes('/'));
      assert.ok(!encoded.includes('+'));
      assert.ok(!encoded.includes('='));
      assert.strictEqual(decodeBase64Url(encoded), value);
    });
  }
});
