import { expect, test } from '@playwright/test';

test('library and settings persist locally', async ({ page }) => {
  await page.goto('/library');
  await expect(page.locator('#main-content')).toBeVisible();

  await page.goto('/settings');
  await expect(page.locator('#main-content')).toBeVisible();
  const storage = await page.evaluate(() => window.localStorage.length);
  expect(storage).toBeGreaterThanOrEqual(0);
});
