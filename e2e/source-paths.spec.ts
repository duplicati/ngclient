import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const segment = 'long-directory-name-'.repeat(12);
const sources = [
  `/source/${segment}/file.txt`,
  'C:\\source\\' + segment + '\\file.txt',
  '\\\\server\\share\\' + segment + '\\file.txt',
];
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function openSources(page: Page) {
  const saves: Route[] = [];
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/backup/42', (route) => {
    if (route.request().method() === 'PUT') {
      saves.push(route);
      return;
    }
    return route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Long source paths',
          Description: '',
          Sources: sources,
          Settings: [{ Name: '--no-encryption', Value: 'True' }],
          TargetURL: 'file:///backup',
          Filters: [],
          Metadata: {},
          OperationType: 'Backup',
        },
        Schedule: null,
      },
    });
  });
  await navigate(page, '/backup/42/source-data');
  await expect(page.getByRole('heading', { name: 'Source Data', exact: true })).toBeVisible();
  return saves;
}
for (const width of [1280, 390]) {
  test(`long source paths remain readable without horizontal overflow at ${width}px`, async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await openSources(page);
    if (width < 600) {
      await page.locator('.mobile-menu-toggle').click();
      await expect(page.locator('app-source-data .right')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    }
    const rows = page.locator('app-source-data .path');
    for (let i = 0; i < sources.length; i++) {
      const text = rows.nth(i).locator('.source-path-text');
      await expect(text).toHaveText(sources[i]);
      await expect(text).toHaveAttribute('title', sources[i]);
      const layout = await text.evaluate((el) => ({
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(el).lineHeight),
        scroll: el.scrollWidth,
        client: el.clientWidth,
      }));
      expect(layout.height).toBeGreaterThan(layout.line * 2);
      expect(layout.width).toBeGreaterThan(40);
      expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
      const row = rows.nth(i);
      const bounds = await row.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await expect(row.locator('button').first()).toBeVisible();
      await expect(row.locator('button').last()).toBeVisible();
    }
  });
}
test('wrapping source paths preserves editing and the saved source values', async ({ authenticatedPage: page }) => {
  const saves = await openSources(page);
  const first = page.locator('app-source-data .path').first();
  await expect(first.locator('.source-path-text')).toHaveText(sources[0]);
  await first.locator('button').first().click();
  const changed = '/source/updated-path/';
  await first.getByPlaceholder('Edit path').fill(changed);
  await first.locator('button').first().click();
  await expect(first.locator('.source-path-text')).toHaveText(changed);
  await navigate(page, '/backup/42/options');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].request().postDataJSON().Backup.Sources).toEqual([changed, ...sources.slice(1)]);
  await saves[0].fulfill({ json: {} });
  await expect(page).toHaveURL('/');
});
