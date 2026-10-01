import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const grid = (page: Page) => page.getByRole('grid', { name: 'Instruments' });
const rowHeader = (page: Page, index: number) =>
  page.locator(`[role="row"][aria-rowindex="${index + 2}"] [role="rowheader"]`);
const drawer = (page: Page) => page.getByRole('dialog', { name: /·/ });
const toast = (page: Page, text: string | RegExp) =>
  page.locator('dh-toast-outlet li').filter({ hasText: text });

async function openScreener(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(grid(page)).toHaveAttribute('aria-busy', 'false');
}

/** Adds the instrument in the given row from the detail drawer; returns its symbol. */
async function addFromDrawer(page: Page, row: number): Promise<string> {
  const symbol = ((await rowHeader(page, row).textContent()) ?? '').trim();
  await rowHeader(page, row).click();
  await drawer(page).getByRole('button', { name: 'Add to watchlist' }).click();
  await expect(
    drawer(page).getByRole('button', { name: 'Remove from watchlist' }),
  ).toBeVisible();
  await drawer(page).getByRole('button', { name: 'Close details' }).click();
  return symbol;
}

test.describe('watchlist', () => {
  test('adds from the drawer with feedback and shows it everywhere', async ({
    page,
  }) => {
    await openScreener(page);
    const symbol = await addFromDrawer(page, 0);

    await expect(
      toast(page, `Added ${symbol} to your watchlist.`),
    ).toBeVisible();
    await expect(rowHeader(page, 0)).toContainText('on watchlist');

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Watchlist' })
      .click();
    await expect(page).toHaveTitle('Watchlist · Market Screener');
    await expect(page.getByRole('link', { name: 'Watchlist' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('table').getByRole('rowheader')).toHaveText([
      symbol,
    ]);
  });

  test('removes with undo, restoring the original position', async ({
    page,
  }) => {
    await openScreener(page);
    const first = await addFromDrawer(page, 0);
    const second = await addFromDrawer(page, 1);
    const third = await addFromDrawer(page, 2);
    await page.goto('/watchlist');
    const symbols = page.getByRole('table').getByRole('rowheader');
    await expect(symbols).toHaveText([first, second, third]);

    await page
      .getByRole('button', { name: `Remove ${second} from watchlist` })
      .click();
    await expect(symbols).toHaveText([first, third]);
    // Focus moves to the next row's button rather than being lost.
    await expect(
      page.getByRole('button', { name: `Remove ${third} from watchlist` }),
    ).toBeFocused();

    await toast(page, `Removed ${second}`)
      .getByRole('button', { name: 'Undo' })
      .click();
    await expect(symbols).toHaveText([first, second, third]);
  });

  test('rolls back a change that cannot be saved and offers a retry', async ({
    page,
  }) => {
    // Make the watchlist write fail, as a rejected request would.
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (
          key === 'dh.watchlist.v1' &&
          (window as unknown as { failWrites?: boolean }).failWrites
        ) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await openScreener(page);
    await page.evaluate(
      () => ((window as unknown as { failWrites: boolean }).failWrites = true),
    );

    await rowHeader(page, 0).click();
    await drawer(page)
      .getByRole('button', { name: 'Add to watchlist' })
      .click();

    const error = toast(page, /^Couldn't add .+\. Your change was undone\./);
    await expect(error).toBeVisible();
    await expect(
      drawer(page).getByRole('button', { name: 'Add to watchlist' }),
    ).toBeVisible();

    await page.evaluate(
      () => ((window as unknown as { failWrites: boolean }).failWrites = false),
    );
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(
      drawer(page).getByRole('button', { name: 'Remove from watchlist' }),
    ).toBeVisible();
  });

  test('queues changes made offline and saves them on reconnect', async ({
    page,
    context,
  }) => {
    await openScreener(page);
    await context.setOffline(true);
    await expect(
      page.getByRole('status').filter({ hasText: "You're offline." }),
    ).toBeVisible();

    const symbol = ((await rowHeader(page, 0).textContent()) ?? '').trim();
    await rowHeader(page, 0).click();
    await drawer(page)
      .getByRole('button', { name: 'Add to watchlist' })
      .click();
    await expect(
      toast(page, `You're offline. ${symbol} will be added`),
    ).toBeVisible();
    // Shown immediately, saved later.
    await expect(
      drawer(page).getByRole('button', { name: 'Remove from watchlist' }),
    ).toBeVisible();

    await context.setOffline(false);
    await expect(
      toast(page, 'Back online: 1 watchlist change saved.'),
    ).toBeVisible();
    // The banner clears (the queued toast may still be visible).
    await expect(page.locator('.app-offline')).toHaveText('');
  });

  test('has no detectable WCAG 2.2 AA violations', async ({
    page,
    context,
  }) => {
    await openScreener(page);
    await addFromDrawer(page, 0);
    await page.goto('/watchlist');
    await expect(page.getByRole('table')).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations,
    ).toEqual([]);

    await context.setOffline(true);
    await expect(page.getByText("You're offline.")).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations,
    ).toEqual([]);
    await context.setOffline(false);
  });
});

test.describe('offline app', () => {
  // The service worker is only registered in production builds (CI serves one). Conditional,
  // not a forgotten skip.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(
    !process.env['CI'],
    'Needs the production build with its service worker',
  );

  test('loads with its data from the service worker cache when offline', async ({
    page,
    context,
    browserName,
  }) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(
      browserName === 'webkit',
      'Playwright WebKit does not support service workers reliably',
    );
    await openScreener(page);
    // Wait until the service worker controls the page, then load once through it so the
    // market data is cached.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            resolve,
            { once: true },
          ),
        );
      }
    });
    await page.reload();
    await expect(grid(page)).toHaveAttribute('aria-busy', 'false');

    await context.setOffline(true);
    await page.reload();
    await expect(grid(page)).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByText('10,000 of 10,000 instruments')).toBeVisible();
    await expect(page.getByText("You're offline.")).toBeVisible();
    await context.setOffline(false);
  });
});
