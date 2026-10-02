import { expect, test } from '@playwright/test';

/**
 * What the hosting layer adds on top of the app: SPA rewrites, cache headers and the Content
 * Security Policy from firebase.json. Runs in CI against the Firebase Hosting emulator and after
 * each deploy against the live site (the @smoke tag). Header checks need a server that applies
 * firebase.json, so they only run when E2E_HOSTING_HEADERS is set.
 */
const checkHeaders = !!process.env['E2E_HOSTING_HEADERS'];

test.describe('hosting', { tag: '@smoke' }, () => {
  test('serves deep links through the SPA rewrite', async ({ page }) => {
    await page.goto('/watchlist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Watchlist',
    );
  });

  test('runs a full journey without Content Security Policy violations', async ({
    page,
  }) => {
    const violations: string[] = [];
    await page.exposeFunction('reportViolation', (v: string) =>
      violations.push(v),
    );
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (e) =>
        (
          window as unknown as { reportViolation: (v: string) => void }
        ).reportViolation(`${e.violatedDirective} ${e.blockedURI}`),
      ),
    );

    await page.goto('/');
    const grid = page.getByRole('grid');
    await expect(grid).toHaveAttribute('aria-busy', 'false');
    await expect(grid).toHaveAttribute('aria-rowcount', '10001');
    // Sorting goes through the query worker; the drawer and its chart are lazy chunks.
    await page.getByRole('columnheader', { name: /^Price/ }).click();
    await expect(page).toHaveURL(/sort=/);
    await page
      .locator('[role="row"][aria-rowindex="2"] [role="rowheader"]')
      .click();
    await expect(page.getByRole('dialog').locator('svg').first()).toBeVisible();
    // Spanish is fetched at runtime.
    await page.goto('/?lang=es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Buscador de mercado',
    );

    expect(violations).toEqual([]);
  });

  test('sends security and cache headers', async ({ request }) => {
    test.skip(!checkHeaders, 'Needs a server that applies firebase.json');

    const page = await request.get('/');
    const headers = page.headers();
    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toBe('no-cache');

    // Hashed bundles are immutable; everything else is revalidated.
    const main = (await page.text()).match(/src="(main-[\w-]+\.js)"/)?.[1];
    expect(main).toBeTruthy();
    const script = await request.get(`/${main}`);
    expect(script.headers()['cache-control']).toContain('immutable');
    const worker = await request.get('/ngsw-worker.js');
    expect(worker.headers()['cache-control']).toBe('no-cache');
  });
});
