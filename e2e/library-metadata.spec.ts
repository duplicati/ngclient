import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const license = (Title: string, Jsondata: string | null) => ({
  Title,
  Jsondata,
  Url: null,
  License: `Full notice for ${Title}`,
});
async function openLibraries(page: Page, rows: ReturnType<typeof license>[]) {
  await page.route('**/api/v1/licenses', (route) => route.fulfill({ json: rows }));
  await page.evaluate(() => {
    history.pushState(null, '', '/about/libraries');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Libraries', exact: true })).toBeVisible();
  await expect(page.locator('app-libraries .license')).toHaveCount(rows.length);
}

test('malformed metadata does not hide neighboring libraries or their full notices', async ({
  authenticatedPage: page,
}) => {
  await openLibraries(page, [
    license('First', JSON.stringify({ description: 'First description', license: 'MIT' })),
    license('Broken', '{invalid'),
    license('Last', JSON.stringify({ description: 'Last description', notes: 'Retained notes' })),
  ]);
  const last = page.locator('app-libraries .license').filter({ has: page.getByRole('heading', { name: /^Last/ }) });
  await expect(page.getByText('First description', { exact: true })).toBeVisible();
  await expect(last.locator('p')).toContainText('Last description');
  const broken = page.locator('app-libraries .license').filter({ has: page.getByRole('heading', { name: /^Broken/ }) });
  await broken.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Full notice for Broken');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await last.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Full notice for Last');
});

test('non-object metadata and non-string fields leave notices available', async ({ authenticatedPage: page }) => {
  await openLibraries(page, [
    license('Array metadata', '[]'),
    license('Null metadata', 'null'),
    license('Number metadata', '42'),
    license('Mixed fields', JSON.stringify({ description: { toString: null }, license: 42, notes: 'Retained string' })),
  ]);
  await expect(page.getByText('Retained string', { exact: true })).toBeVisible();
  await expect(page.locator('app-libraries')).not.toContainText('[object Object]');
  const mixed = page
    .locator('app-libraries .license')
    .filter({ has: page.getByRole('heading', { name: /^Mixed fields/ }) });
  await mixed.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Full notice for Mixed fields');
});
