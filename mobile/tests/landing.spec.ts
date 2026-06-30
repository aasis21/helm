import { test, expect } from '@playwright/test';

// First-run web experience: the onboarding Landing and its hand-off to the
// scanner-first Join screen. Runs at a 412px mobile viewport (playwright.config),
// where Capacitor.isNativePlatform() is false, so the web Landing renders.
test.describe('Helm landing (first run)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows the onboarding hero, primary CTA, and install command', async ({ page }) => {
    await expect(page.locator('.landing-hero h1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan QR to pair' })).toBeVisible();
    await expect(page.locator('.install-code')).toBeVisible();
  });

  test('no horizontal scroll at phone width', async ({ page }) => {
    await expect(page.locator('.landing-shell')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBe(0);
  });

  test('"Scan QR to pair" opens the scanner-first Join screen with manual fallback', async ({ page }) => {
    await page.getByRole('button', { name: 'Scan QR to pair' }).click();
    await expect(page.locator('.join-shell')).toBeVisible();
    const manualToggle = page.getByRole('button', { name: 'Enter code manually' });
    await expect(manualToggle).toBeVisible();
    await manualToggle.click();
    await expect(page.getByLabel('Manual pairing JSON')).toBeVisible();
  });

  test('"Paste a pairing code" lands on Join with the manual box already open', async ({ page }) => {
    await page.getByRole('button', { name: 'Paste a pairing code' }).click();
    await expect(page.locator('.join-shell')).toBeVisible();
    await expect(page.getByLabel('Manual pairing JSON')).toBeVisible();
  });
});
