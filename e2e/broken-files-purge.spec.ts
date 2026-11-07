import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const broken = {
  Success: true,
  Error: null,
  StatusCode: 'OK',
  Data: [{ FilesetID: 1, FilesetTime: '2026-11-01T12:00:00Z', Files: [{ Path: '/source/damaged.txt', Size: 123 }] }],
};
async function navigate(page: Page, path: string) {
  await page.evaluate((url) => {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function openBrokenFiles(page: Page) {
  await page.route(/\/api\/v1\/backup\/(42|43)$/, (route) =>
    route.fulfill({
      json: {
        Backup: { ID: new URL(route.request().url()).pathname.split('/').at(-1), OperationType: 'Backup' },
      },
    })
  );
  await page.route('**/api/v2/backup/list-broken-files', (route) => route.fulfill({ json: broken }));
  const requests: Route[] = [];
  await page.route('**/api/v2/backup/purge-broken-files', (route) => {
    requests.push(route);
  });
  await navigate(page, '/backup/42/broken-files');
  await expect(page.getByText('/source/damaged.txt', { exact: true })).toBeVisible();
  return requests;
}
async function confirm(page: Page) {
  await page.getByRole('button', { name: 'Purge broken files', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm purge', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Purge broken files', exact: true }).click();
}

test('cancels safely, submits the reviewed backup once, and permits retry after failure', async ({
  authenticatedPage: page,
}) => {
  const requests = await openBrokenFiles(page);
  await page.getByRole('button', { name: 'Purge broken files', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(requests).toHaveLength(0);
  await confirm(page);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].request().postDataJSON()).toEqual({ BackupId: '42' });
  await expect(page.getByRole('button', { name: 'Purge broken files', exact: true })).toBeDisabled();
  await page.keyboard.press('Enter');
  expect(requests).toHaveLength(1);
  await requests[0].fulfill({ status: 503, json: { Error: 'Temporary failure' } });
  await expect(page.getByRole('alert').filter({ hasText: 'Could not purge the broken files.' })).toBeVisible();
  await expect(page.getByText('/source/damaged.txt', { exact: true })).toBeVisible();
  await confirm(page);
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].request().postDataJSON()).toEqual({ BackupId: '42' });
  await requests[1].fulfill({ json: { Success: true, Error: null, StatusCode: 'OK' } });
  await expect(page).toHaveURL('/');
});

test('an earlier job confirmation cannot purge the next job', async ({ authenticatedPage: page }) => {
  const requests = await openBrokenFiles(page);
  await page.getByRole('button', { name: 'Purge broken files', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm purge', exact: true })).toBeVisible();
  await navigate(page, '/backup/43/broken-files');
  await expect(page).toHaveURL('/backup/43/broken-files');
  await page.getByRole('dialog').getByRole('button', { name: 'Purge broken files', exact: true }).click();
  expect(requests).toHaveLength(0);
  await confirm(page);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].request().postDataJSON()).toEqual({ BackupId: '43' });
  await requests[0].fulfill({ json: { Success: true, Error: null, StatusCode: 'OK' } });
  await expect(page).toHaveURL('/');
});

test('leaving during purge prevents a late response from navigating away', async ({ authenticatedPage: page }) => {
  const requests = await openBrokenFiles(page);
  await confirm(page);
  await expect.poll(() => requests.length).toBe(1);
  await navigate(page, '/about/system-info');
  await expect(page.getByRole('heading', { name: 'System info', exact: true })).toBeVisible();
  await requests[0].fulfill({ json: { Success: true, Error: null, StatusCode: 'OK' } });
  await expect(page).toHaveURL('/about/system-info');
  await expect(page.getByRole('heading', { name: 'System info', exact: true })).toBeVisible();
});
