import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('has a title, a main landmark and a working skip link', async ({
    page,
    browserName,
  }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Market Screener');
    await expect(page.getByRole('main')).toBeAttached();

    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    if (browserName === 'webkit') {
      // Safari only tabs to links with a user setting (or Option+Tab, which Playwright's WebKit
      // build does not honour on every platform), so focus it directly there.
      await skipLink.focus();
    } else {
      await page.keyboard.press('Tab');
    }
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('has no detectable WCAG 2.2 AA violations', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
