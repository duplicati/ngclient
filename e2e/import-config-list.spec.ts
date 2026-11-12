import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function openConfigurationList(page: Page) {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/backups?temporary=true', (route) => route.fulfill({ json: { ID: 'import-temp' } }));
  const lists: Route[] = [];
  await page.route('**/api/v1/backup/import-temp/restore-task-config', (route) => {
    lists.push(route);
  });
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
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL('/backup/import-destination/select-config');
  await expect.poll(() => lists.length).toBe(1);
  return lists;
}

test('configuration list failure is retryable without presenting an empty destination', async ({
  authenticatedPage: page,
}) => {
  const lists = await openConfigurationList(page);
  await lists[0].fulfill({ status: 500, json: { Error: 'Destination unavailable' } });
  await expect(page.getByRole('alert')).toContainText('Could not fetch backup configurations');
  await expect(page.getByText('No backup configurations found at this destination.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import selected', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => lists.length).toBe(2);
  await expect(page.getByRole('status')).toContainText('Fetching backup configurations');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await lists[1].fulfill({
    json: [{ BackupId: 'saved', Name: 'Available configuration', TargetURLDisplay: 'file:///archive', Metadata: {} }],
  });
  await expect(page.getByRole('heading', { name: /Available configuration/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import selected', exact: true })).toBeEnabled();
  expect(lists).toHaveLength(2);
});

test('configuration list reports empty only after a successful response', async ({ authenticatedPage: page }) => {
  const lists = await openConfigurationList(page);
  await expect(page.getByRole('status')).toContainText('Fetching backup configurations');
  await lists[0].fulfill({ json: [] });
  await expect(page.getByText('No backup configurations found at this destination.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
});

test('leaving configuration loading prevents a late error dialog', async ({ authenticatedPage: page }) => {
  const lists = await openConfigurationList(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL('/backup/import-destination/encryption');
  const completed = page.waitForResponse((response) => response.url().includes('/restore-task-config'));
  await lists[0].fulfill({ status: 500, json: { Error: 'Late failure' } });
  await completed;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL('/backup/import-destination/encryption');
});

test('search and import options retain their values in the selected configuration request', async ({
  authenticatedPage: page,
}) => {
  const imports: Route[] = [];
  await page.route('**/api/v1/backup/**importfromtemp', (route) => {
    imports.push(route);
  });
  const lists = await openConfigurationList(page);
  await lists[0].fulfill({
    json: [
      { BackupId: 'a', Name: 'Alpha', TargetURLDisplay: 'file:///alpha', Metadata: {} },
      { BackupId: 'b', Name: 'Beta', TargetURLDisplay: 'file:///beta', Metadata: {} },
    ],
  });
  const search = page.getByPlaceholder('Search for destination...', { exact: true });
  await search.fill('beta');
  const cards = page.locator('.config-list sh-card');
  await expect(cards.first()).toContainText('Beta');
  await page.getByRole('button', { name: 'Clear search', exact: true }).press('Enter');
  await expect(search).toHaveValue('');
  await cards.filter({ hasText: 'Beta' }).press('Enter');
  await page.locator('.options sh-toggle').filter({ hasText: 'Save now' }).locator('input').check();
  await page.locator('.options sh-toggle').filter({ hasText: 'Import metadata' }).locator('input').check();
  await page.getByRole('button', { name: 'Import selected', exact: true }).click();
  await expect.poll(() => imports.length).toBe(1);
  expect(imports[0].request().postDataJSON()).toEqual({ BackupId: 'b', ImportMetadata: true, Direct: true });
});
