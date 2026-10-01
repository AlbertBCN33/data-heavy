import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Runs on the mobile-chrome project only (see playwright.config.mts).
test.describe('on a phone', { tag: '@mobile' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-busy', 'false');
  });

  test('reflows to the device width without horizontal scrolling (WCAG 1.4.10)', async ({
    page,
  }) => {
    // Mobile browsers widen the layout viewport (zooming out) when content is too wide, so
    // compare against the device width, not window.innerWidth alone.
    const device = page.viewportSize()?.width ?? 0;
    const { layout, content } = await page.evaluate(() => ({
      layout: window.innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(layout).toBe(device);
    expect(content).toBeLessThanOrEqual(device);
  });

  test('also reflows at 320 CSS pixels, the WCAG reference width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(page.getByRole('grid')).toHaveAttribute('aria-busy', 'false');
    const { layout, content } = await page.evaluate(() => ({
      layout: window.innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(layout).toBe(320);
    expect(content).toBeLessThanOrEqual(320);
  });

  test('collapses the filters behind a toggle', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Show' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('searchbox', { name: 'Search' })).toBeHidden();

    await toggle.click();
    await expect(page.getByRole('button', { name: 'Hide' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.getByRole('searchbox', { name: 'Search' })).toBeVisible();
  });

  test('opens the detail drawer across the full width', async ({ page }) => {
    await page
      .locator('[role="row"][aria-rowindex="2"] [role="rowheader"]')
      .click();
    const drawer = page.getByRole('dialog', { name: /·/ });
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(Math.round(box?.width ?? 0)).toBe(width);
  });

  test('has no detectable WCAG 2.2 AA violations', async ({ page }) => {
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations,
    ).toEqual([]);
  });
});
