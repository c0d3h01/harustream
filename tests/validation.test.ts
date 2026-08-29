import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { AppError, errorResponseBody, httpStatusForError } from '@/lib/errors';
import {
  parseRaw,
  rawEpisodeSchema,
  rawInfoSchema,
  rawPostSchema,
  rawStreamSchema,
} from '@/validations/provider';

describe('provider boundary validation', () => {
  it('rejects a response missing required fields', () => {
    expect(() =>
      parseRaw(rawPostSchema, { image: '' }, { provider: 'test', op: 'search' }),
    ).toThrow(/invalid response/);
  });

  it.each([
    ['post', rawPostSchema, { title: '', link: '' }],
    ['info', rawInfoSchema, { title: '', type: '', linkList: [] }],
    ['episode', rawEpisodeSchema, { title: '', link: '' }],
    ['stream', rawStreamSchema, { server: '', link: '', type: '' }],
  ])('rejects invalid raw %s responses', (operation, schema, value) => {
    expect(() =>
      parseRaw(schema as ZodType<unknown>, value, { provider: 'test', op: operation }),
    ).toThrow(/invalid response/);
  });

  it.each([
    ['BAD_REQUEST', 400],
    ['NOT_FOUND', 404],
    ['PROVIDER_ERROR', 502],
    ['PROVIDER_TIMEOUT', 504],
    ['INVALID_RESPONSE', 502],
    ['UPSTREAM', 502],
    ['CONFIG', 500],
  ] as const)('maps %s to HTTP %s', (code, status) => {
    expect(httpStatusForError(new AppError(code, 'internal detail'))).toBe(status);
  });

  it('returns a safe error message without leaking internal details', () => {
    expect(
      errorResponseBody(new AppError('UPSTREAM', 'axios URL https://secret.test'), 'req-1'),
    ).toEqual({
      error: 'Upstream service unavailable',
      code: 'UPSTREAM',
      requestId: 'req-1',
    });
  });
});
