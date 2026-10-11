import { expect, test } from '@playwright/test';

test('search box updates query param and shows results state', async ({ page }) => {
  await page.goto('/search');
  const box = page.getByLabel(/search movies and series/i);
  await expect(box).toBeVisible();
  await box.fill('naruto');
  await expect(page).toHaveURL(/q=naruto/, { timeout: 10_000 });
  // Catalog without TMDB key renders config notice; with key renders results.
  await expect(page.locator('#main-content')).toContainText(/naruto|configuration|API key/i);
});

test('search returns query-matched results, not trending', async ({ page }) => {
  await page.goto('/search?q=inception');
  await expect(page.getByRole('heading', { name: /results for "inception"/i })).toBeVisible();
  // Real search must include the matching title; trending list does not.
  await expect(
    page
      .locator('#main-content')
      .getByRole('link', { name: /inception/i })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
});
