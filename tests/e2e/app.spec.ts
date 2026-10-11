import { expect, test } from '@playwright/test';

test('home loads with nav and main content', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('link', { name: /haru.*stream/i }).first()).toBeVisible();
});

test('primary pages respond without 404', async ({ page }) => {
  for (const path of ['/search', '/library', '/settings']) {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('#main-content')).toBeVisible();
  }
});
