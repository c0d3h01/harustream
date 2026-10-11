import { expect, test } from '@playwright/test';

test('health answers ok with request id', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers()['x-request-id']).toBeTruthy();
});

test('unknown api route answers 404', async ({ request }) => {
  const response = await request.get('/api/definitely-not-a-route');
  expect(response.status()).toBe(404);
});
