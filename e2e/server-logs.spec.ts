import { type Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function navigate(page: Page, path: string) {
  await page.evaluate((url) => {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test('server log tabs and level controls still follow navigation after reopening logs', async ({
  authenticatedPage: page,
}) => {
  const levels: string[] = [];
  await page.route('**/api/v1/logdata/log**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/logdata/poll**', (route) => {
    levels.push(new URL(route.request().url()).searchParams.get('level') ?? '');
    return route.fulfill({ json: [] });
  });

  for (let visit = 0; visit < 2; visit++) {
    const previousRequests = levels.length;
    await navigate(page, '/about/logs/stored');
    const logs = page.locator('app-logs');
    await expect(page.locator('app-logs-stored')).toBeVisible();
    await expect(logs.getByRole('button', { name: 'Log level:', exact: false })).toHaveCount(0);
    await logs.getByRole('button', { name: 'Live', exact: true }).click();
    await expect(page.locator('app-logs-live')).toBeVisible();
    await logs.getByRole('button', { name: 'Log level: Disabled', exact: true }).click();
    await page.getByRole('button', { name: 'Warning', exact: true }).click();
    await expect(logs.getByRole('button', { name: 'Log level: Warning', exact: true })).toBeVisible();
    await expect.poll(() => levels.length).toBeGreaterThan(previousRequests);
    expect(levels.every((level) => level === 'Warning')).toBe(true);
    await logs.getByRole('button', { name: 'Stored', exact: true }).click();
    await expect(page.locator('app-logs-stored')).toBeVisible();
    await expect(logs.getByRole('button', { name: 'Log level:', exact: false })).toHaveCount(0);
    await navigate(page, '/');
    await expect(logs).toHaveCount(0);
  }
});
