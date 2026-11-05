import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function openImport(page: Page) {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  const requests: Route[] = [];
  await page.route('**/api/v1/backups?temporary=true', (route) => {
    requests.push(route);
  });
  await page.route('**/api/v1/backup/*/restore-task-config', (route) => route.fulfill({ json: [] }));
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/import-destination/destination');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button', { name: 'Set target URL', exact: true }).click();
  await page.locator('#targetUrl').fill('file:///archive');
  await page.getByRole('button', { name: 'Override target URL', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip test and continue', exact: true }).click();
  await expect(page).toHaveURL('/backup/import-destination/encryption');
  await page.getByLabel('Password', { exact: true }).fill('original passphrase');
  return requests;
}

test('import preparation submits once and advances only after success', async ({ authenticatedPage: page }) => {
  const requests = await openImport(page);
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await next.click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(next).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText('Preparing configuration import…');
  await expect(page.locator('.encryption-fields')).toHaveAttribute('inert', '');
  await page.keyboard.press('Enter');
  await page.locator('app-import-destination-encryption form').dispatchEvent('submit');
  expect(requests).toHaveLength(1);
  expect(requests[0].request().postDataJSON()).toEqual({
    Backup: { TargetURL: 'file:///archive', Settings: [{ Name: '--passphrase', Value: 'original passphrase' }] },
  });
  await requests[0].fulfill({ json: { ID: 'import-success' } });
  await expect(page).toHaveURL('/backup/import-destination/select-config');
});

test('import preparation retains input after failure and retries the current passphrase', async ({
  authenticatedPage: page,
}) => {
  const requests = await openImport(page);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  await requests[0].fulfill({ status: 500, json: { Error: 'Unable to create temporary backup' } });
  await expect(page.getByRole('alert')).toHaveText('Could not prepare the configuration import. Please try again.');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('original passphrase');
  await page.getByLabel('Password', { exact: true }).fill('updated passphrase');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].request().postDataJSON().Backup.Settings[0].Value).toBe('updated passphrase');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await requests[1].fulfill({ json: { ID: 'import-retry' } });
  await expect(page).toHaveURL('/backup/import-destination/select-config');
});

test('leaving import preparation ignores the old response and allows a new attempt', async ({
  authenticatedPage: page,
}) => {
  const requests = await openImport(page);
  const configRequests: string[] = [];
  await page.route('**/api/v1/backup/*/restore-task-config', (route) => {
    configRequests.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: [] });
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL('/backup/import-destination/destination');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip test and continue', exact: true }).click();
  await expect(page).toHaveURL('/backup/import-destination/encryption');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  await requests[0].fulfill({ json: { ID: 'abandoned' } });
  await expect(page.getByRole('status')).toHaveText('Preparing configuration import…');
  await requests[1].fulfill({ json: { ID: 'current' } });
  await expect(page).toHaveURL('/backup/import-destination/select-config');
  await expect.poll(() => configRequests).toEqual(['/api/v1/backup/current/restore-task-config']);
});
