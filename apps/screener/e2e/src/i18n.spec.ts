import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const language = (page: Page) =>
  page.getByRole('combobox', { name: /^(Language|Idioma)$/ });

async function open(page: Page, path = '/') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await expect(page.getByRole('grid')).toHaveAttribute('aria-busy', 'false');
}

test.describe('languages', () => {
  test('switches to Spanish at runtime, including number and date formats', async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Market screener',
    );

    await language(page).selectOption('es');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Buscador de mercado',
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    // Spanish grouping and wording in the live count.
    await expect(page.getByText('10.000 de 10.000 instrumentos')).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: /^Variación/ }),
    ).toBeVisible();
    // Prices use a decimal comma.
    const price = page.locator(
      '[role="row"][aria-rowindex="2"] [aria-colindex="5"]',
    );
    await expect(price).toHaveText(/\d,\d{2}/);
    await expect(page.getByRole('link', { name: 'Favoritos' })).toBeVisible();
  });

  test('remembers the choice across reloads', async ({ page }) => {
    await open(page);
    await language(page).selectOption('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Buscador de mercado',
    );
    await expect(language(page)).toHaveValue('es');
  });

  test('opens a ?lang= link in that language', async ({ page }) => {
    await open(page, '/?lang=es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Buscador de mercado',
    );
    await page.getByRole('link', { name: 'Favoritos' }).click();
    await expect(page).toHaveTitle('Favoritos · Market Screener');
  });

  test('accepts Spanish number input in range filters', async ({ page }) => {
    await open(page, '/?lang=es');
    const price = page.getByRole('group', { name: 'Precio' });
    await price.getByLabel('Mín.').fill('2,5');
    await price.getByLabel('Máx.').fill('1.000');
    await price.getByLabel('Máx.').press('Enter');
    await expect(page.getByText('1 activo', { exact: true })).toBeVisible();
    // The URL keeps canonical numbers.
    await expect(page).toHaveURL(/price=2\.5\.\.1000/);
    // And the inputs show them back in Spanish format.
    await expect(price.getByLabel('Mín.')).toHaveValue('2,5');
  });

  test('shows the detail drawer in Spanish', async ({ page }) => {
    await open(page, '/?lang=es');
    await page
      .locator('[role="row"][aria-rowindex="2"] [role="rowheader"]')
      .click();
    const drawer = page.getByRole('dialog', { name: /·/ });
    await expect(
      drawer.getByRole('button', { name: 'Añadir a favoritos' }),
    ).toBeVisible();
    await expect(drawer.getByText('Rango 52 semanas')).toBeVisible();
    await expect(drawer.locator('figcaption')).toHaveText(
      /^(Sube|Baja|Sin cambios) /,
    );
    await expect(
      drawer.getByRole('button', { name: 'Cerrar detalles' }),
    ).toBeVisible();
  });

  test('has no detectable WCAG 2.2 AA violations in Spanish', async ({
    page,
  }) => {
    await open(page, '/?lang=es');
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations,
    ).toEqual([]);
  });
});
