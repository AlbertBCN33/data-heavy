import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const grid = (page: Page) => page.getByRole('grid', { name: 'Instruments' });
const firstRowHeader = (page: Page) =>
  page.locator('[role="row"][aria-rowindex="2"] [role="rowheader"]');
const drawer = (page: Page) => page.getByRole('dialog');

async function openScreener(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(grid(page)).toHaveAttribute('aria-busy', 'false');
}

/** Opens the drawer for the first row and returns that row's symbol. */
async function openFirstRow(page: Page): Promise<string> {
  const symbol = (await firstRowHeader(page).textContent())?.trim() ?? '';
  await firstRowHeader(page).click();
  await expect(drawer(page)).toBeVisible();
  return symbol;
}

test.describe('instrument detail drawer', () => {
  test('opens for the selected row with stats and a captioned chart', async ({
    page,
  }) => {
    await openScreener(page);
    const symbol = await openFirstRow(page);

    await expect(page).toHaveURL(/sel=/);
    await expect(drawer(page)).toHaveAccessibleName(
      new RegExp(`^${symbol} · `),
    );
    await expect(drawer(page).getByText('Market cap')).toBeVisible();
    await expect(drawer(page).locator('figcaption')).toHaveText(
      /^(Up|Down|Unchanged) /,
    );
  });

  test('shows a 52-week range that matches the one-year chart', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openScreener(page);
    await openFirstRow(page);
    const high = (
      await drawer(page).locator('.dh-chart__label--high').textContent()
    )?.trim();
    const low = (
      await drawer(page).locator('.dh-chart__label--low').textContent()
    )?.trim();
    const range = drawer(page)
      .locator('dt', { hasText: '52-week range' })
      .locator('xpath=following-sibling::dd');
    await expect(range).toHaveText(`${low} – ${high}`);
  });

  test('opens from the keyboard and returns focus to the cell on Escape', async ({
    page,
  }) => {
    await openScreener(page);
    await grid(page).getByRole('columnheader').first().click();
    await page.keyboard.press('ArrowDown');
    await expect(firstRowHeader(page)).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(drawer(page)).toBeVisible();
    await expect(
      drawer(page).getByRole('button', { name: 'Close details' }),
    ).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/sel=/);
    await expect(firstRowHeader(page)).toBeFocused();
  });

  test('is part of browser history: Back reopens a closed drawer', async ({
    page,
  }) => {
    await openScreener(page);
    await openFirstRow(page);
    await drawer(page).getByRole('button', { name: 'Close details' }).click();
    await expect(drawer(page)).toBeHidden();

    await page.goBack();
    await expect(drawer(page)).toBeVisible();
  });

  test('opens directly from a shared link', async ({ page }) => {
    await openScreener(page);
    const symbol = await openFirstRow(page);
    const url = page.url();

    const other = await page.context().newPage();
    await other.goto(url);
    await expect(other.getByRole('dialog')).toHaveAccessibleName(
      new RegExp(`^${symbol} · `),
    );
    await other.close();
  });

  test('explains an outdated link instead of failing', async ({ page }) => {
    await openScreener(page, '?sel=NYSE:NOPE');
    await expect(drawer(page)).toHaveAccessibleName('Instrument not found');
    await expect(
      drawer(page).getByText('The link may be outdated.'),
    ).toBeVisible();
  });

  test('switches the chart range with the keyboard', async ({ page }) => {
    await openScreener(page);
    await openFirstRow(page);
    const caption = drawer(page).locator('figcaption');
    const oneYear = await caption.textContent();

    const year = drawer(page).getByRole('radio', { name: '1 year' });
    await expect(year).toBeChecked();
    await year.focus();
    await page.keyboard.press('ArrowLeft'); // radios move with the arrow keys
    await expect(
      drawer(page).getByRole('radio', { name: '6 months' }),
    ).toBeChecked();
    await expect(caption).not.toHaveText(oneYear ?? '');
  });

  test('offers the price series as a table', async ({ page }) => {
    await openScreener(page);
    await openFirstRow(page);

    const toggle = drawer(page).getByRole('button', {
      name: 'Show price table',
    });
    await toggle.click();
    const table = drawer(page).getByRole('table', {
      name: /Daily closing prices/,
    });
    await expect(table).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(253); // header + 252 sessions
    await expect(
      drawer(page).getByRole('button', { name: 'Hide price table' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no detectable WCAG 2.2 AA violations (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
      await openScreener(page);
      await openFirstRow(page);
      await expect(drawer(page).locator('figcaption')).toBeVisible();
      await drawer(page)
        .getByRole('button', { name: 'Show price table' })
        .click();

      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
