import { expect, test } from '@playwright/test';

test('hidden hero slides mount no Watch CTA and rotation advances', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('div[data-active="true"] >> button:has-text("Watch")')).toHaveCount(1);
  await expect(page.locator('div[data-active="false"] >> button:has-text("Watch")')).toHaveCount(0);
  const first = await page.locator('div[data-active="true"] h1').textContent();
  await page.getByRole('button', { name: /^Go to slide 2/ }).click();
  await expect(page.locator('div[data-active="true"] h1')).not.toHaveText(first ?? '');
});
