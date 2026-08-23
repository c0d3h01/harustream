import { describe, expect, it } from 'vitest';
import { decodeRef, encodeRef } from '@/lib/refs';

describe('opaque title references', () => {
  it.each([
    'https://themoviebox.org/moviesDetail/breaking-bad',
    '{"subjectId":"6207982430134357800","detailPath":"breaking-bad-ej6Bp0MCAo7","language":"Original Audio"}',
  ])('round trips %s', (value) => {
    const encoded = encodeRef(value);
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('=');
    expect(decodeRef(encoded)).toBe(value);
  });
});
