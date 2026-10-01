import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const grid = (page: Page) => page.getByRole('grid', { name: 'Instruments' });
const columnHeader = (page: Page, name: string) =>
  grid(page).getByRole('columnheader', { name: new RegExp(`^${name}`) });

async function openScreener(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(grid(page)).toHaveAttribute('aria-busy', 'false');
}

test.describe('screener', () => {
  test('shows 10,000 instruments in a virtualized grid with correct ARIA counts', async ({
    page,
  }) => {
    await openScreener(page);

    await expect(page.getByText('10,000 of 10,000 instruments')).toBeVisible();
    await expect(grid(page)).toHaveAttribute('aria-rowcount', '10001');
    // Only a window of rows is in the DOM.
    const rendered = await grid(page).getByRole('row').count();
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(100);
    await expect(columnHeader(page, 'Market cap')).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  test('restores a shared view from the URL', async ({ page }) => {
    await openScreener(
      page,
      '?sector=Energy&sort=price&cols=symbol,name,sector,price',
    );

    await expect(columnHeader(page, 'Price')).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await expect(grid(page).getByRole('columnheader')).toHaveCount(4);
    const sectors = await grid(page)
      .locator('[aria-colindex="3"][role="gridcell"]')
      .allTextContents();
    expect(sectors.length).toBeGreaterThan(0);
    expect(sectors.every((s) => s.trim() === 'Energy')).toBe(true);
    await expect(page.getByText(/^[\d,]+ of 10,000 instruments/)).toBeVisible();
  });

  test('sorts from the header, writes the URL and supports Back', async ({
    page,
  }) => {
    await openScreener(page);

    await columnHeader(page, 'Price').click();
    await expect(page).toHaveURL(/sort=-price/);
    await expect(columnHeader(page, 'Price')).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    await columnHeader(page, 'Name').click({ modifiers: ['Shift'] });
    await expect(page).toHaveURL(/sort=-price%2Cname|sort=-price,name/);

    await page.goBack();
    await expect(page).toHaveURL(/sort=-price$/);
    await page.goBack();
    await expect(columnHeader(page, 'Market cap')).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  test('filters by text search without adding a history entry per keystroke', async ({
    page,
  }) => {
    await openScreener(page);
    const before = await page.evaluate(() => history.length);

    await page.getByRole('searchbox', { name: 'Search' }).fill('bank');
    await expect(page).toHaveURL(/q=bank/);
    await expect(
      page.getByText(/^[\d,]+ of 10,000 instruments/),
    ).not.toHaveText(/^10,000 of/);
    expect(await page.evaluate(() => history.length)).toBe(before);
  });

  test('filters with the sector multi-select using the keyboard', async ({
    page,
  }) => {
    await openScreener(page);

    const sector = page.getByRole('combobox', { name: 'Sector' });
    await sector.focus();
    await page.keyboard.press('Enter');
    const listbox = page.getByRole('listbox', { name: 'Sector' });
    await expect(listbox).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/sector=/);
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(sector).toBeFocused();
  });

  test('validates range filters before applying them', async ({ page }) => {
    await openScreener(page);
    const price = page.getByRole('group', { name: 'Price' });

    await price.getByLabel('Min').fill('500');
    await price.getByLabel('Max').fill('10');
    await price.getByLabel('Max').press('Enter');
    await expect(price.getByLabel('Max')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    // Leaving Min committed the valid 500.. range; the reversed range must never be applied.
    await expect(page).not.toHaveURL(/price=500\.\.10(&|$)/);

    await price.getByLabel('Max').fill('2k');
    await price.getByLabel('Max').press('Enter');
    await expect(page).toHaveURL(/price=500\.\.2000/);
  });

  test('navigates the grid with the keyboard, beyond the rendered rows', async ({
    page,
  }) => {
    await openScreener(page);

    await columnHeader(page, 'Symbol').click();
    await expect(columnHeader(page, 'Symbol')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
      page.locator('[role="row"][aria-rowindex="2"] [role="rowheader"]'),
    ).toBeFocused();

    await page.keyboard.press('Control+End');
    const lastRow = page.locator('[role="row"][aria-rowindex="10001"]');
    await expect(lastRow).toBeVisible();
    await expect(lastRow.locator('[tabindex="0"]')).toBeFocused();

    await page.keyboard.press('Control+Home');
    await expect(columnHeader(page, 'Symbol')).toBeFocused();
  });

  test('selects a row with Enter and records it in the URL', async ({
    page,
  }) => {
    await openScreener(page);
    const firstRow = page.locator('[role="row"][aria-rowindex="2"]');

    await firstRow.getByRole('rowheader').click();
    await expect(page).toHaveURL(/sel=[A-Z]+%3A|sel=[A-Z]+:/);
    await expect(firstRow).toHaveAttribute('aria-selected', 'true');
  });

  test('hides and reorders columns from the column picker', async ({
    page,
  }) => {
    await openScreener(page);

    await page.getByRole('button', { name: 'Columns' }).click();
    const dialog = page.getByRole('dialog', { name: 'Columns' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: 'Volume' }).uncheck();
    const moveUp = dialog.getByRole('button', { name: 'Move Price up' });
    await moveUp.click();
    await expect(moveUp).toBeFocused();
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/cols=/);
    await expect(columnHeader(page, 'Volume')).toHaveCount(0);
  });

  test('ignores invalid link settings and says so', async ({ page }) => {
    await openScreener(page, '?price=cheap&sector=Crypto');
    await expect(
      page.getByText('Some settings in this link were not recognised'),
    ).toBeVisible();
    await expect(page.getByText('10,000 of 10,000 instruments')).toBeVisible();
  });

  test('shows an empty state with a way out', async ({ page }) => {
    await page.goto('/?q=zzzzzzzz');
    await expect(
      page.getByText('No instruments match these filters.'),
    ).toBeVisible();
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Clear filters' })
      .last()
      .click();
    await expect(page.getByText('10,000 of 10,000 instruments')).toBeVisible();
  });

  test('has no detectable WCAG 2.2 AA violations', async ({ page }) => {
    // Scan settled UI: mid-animation frames (e.g. the dialog fading in) are not real contrast
    // failures, and reduced motion is a supported mode in its own right.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openScreener(page, '?sector=Energy&sort=-changePct');
    const loaded = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(loaded.violations).toEqual([]);

    await page.getByRole('button', { name: 'Columns' }).click();
    await expect(page.getByRole('dialog', { name: 'Columns' })).toBeVisible();
    const dialog = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(dialog.violations).toEqual([]);
  });
});
