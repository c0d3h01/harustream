import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
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

  it('round trips when Buffer lacks the base64url encoding', () => {
    const originalToString = Buffer.prototype.toString;
    const toStringSpy = vi.spyOn(Buffer.prototype, 'toString');
    toStringSpy.mockImplementation(function (this: Buffer, ...args: Array<unknown>): string {
      if (args[0] === 'base64url') throw new Error('Unknown encoding: base64url');
      return Reflect.apply(originalToString, this, args) as string;
    });
    try {
      const value = 'https://example.test/火影忍者 Naruto';
      const encoded = encodeBase64Url(value);
      assert.ok(!encoded.includes('/'));
      assert.ok(!encoded.includes('+'));
      assert.ok(!encoded.includes('='));
      assert.strictEqual(decodeBase64Url(encoded), value);
    } finally {
      toStringSpy.mockRestore();
    }
  });

  it('round trips without Node Buffer', () => {
    vi.stubGlobal('Buffer', undefined);
    try {
      const value = 'https://example.test/ Naruto';
      assert.strictEqual(decodeBase64Url(encodeBase64Url(value)), value);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
