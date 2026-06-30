import { test, expect } from '@playwright/test';

// Drives the in-app Demo / Simulator (no phone needed) and asserts the v2 chat
// surface: compact top bar, inline collapsed tool cards, right-aligned user
// bubbles, a space-smart composer, the multi-session drawer, and — critically —
// no horizontal scroll at a 412px phone width.
test.describe('Helm chat UI v2', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Demo / Simulator').click();
    await expect(page.locator('.helm-session')).toBeVisible();
    await expect(page.locator('.status-bar')).toBeVisible();
  });

  test('compact status bar shows a live session status', async ({ page }) => {
    await expect(page.locator('.status-dot')).toBeVisible();
    await expect(page.locator('.status-title')).toContainText('Demo session');
  });

  test('tool calls render inline and collapsed, then expand on tap', async ({ page }) => {
    const tool = page.locator('.tc-head').first();
    await expect(tool).toBeVisible({ timeout: 15_000 });
    // collapsed by default
    await expect(page.locator('.tc-detail')).toHaveCount(0);
    await tool.click();
    await expect(page.locator('.tc-detail').first()).toBeVisible();
  });

  test('composer is space-smart (single row, not the legacy 136px box)', async ({ page }) => {
    const height = await page
      .locator('.composer textarea')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeLessThan(60);
  });

  test('user prompts appear as a right-aligned bubble', async ({ page }) => {
    await page.locator('.composer textarea').fill('Run the tests next?');
    await page.keyboard.press('Enter');
    const userRow = page.locator('.row.user').first();
    await expect(userRow).toBeVisible();
    await expect(userRow).toContainText('Run the tests next?');
  });

  test('no horizontal scroll at phone width', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBe(0);
  });

  test('session drawer opens and lists the joined session', async ({ page }) => {
    await page.locator('.drawer-btn').click();
    await expect(page.locator('.drawer-title')).toHaveText('SESSIONS');
    await expect(page.locator('.session-title').first()).toContainText('Demo session');
  });
});
