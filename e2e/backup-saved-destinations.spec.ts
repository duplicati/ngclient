import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const saved = [
  { ID: 7, Name: 'Archive storage', Description: 'Saved archive', BaseUrl: 'ssh://user@example.test/archive' },
  { ID: 8, Name: 'Offsite copy', Description: '', BaseUrl: 'ssh://user@example.test/offsite' },
];

async function openDestination(page: Page, destinations: typeof saved) {
  await page.route('**/api/v2/connection-strings', (route) =>
    route.fulfill({ json: { Success: true, Data: destinations } })
  );
  await page.route('**/api/v1/backupdefaults', (route) =>
    route.fulfill({
      json: {
        Backup: {
          Name: 'Saved destinations',
          Description: '',
          TargetURL: null,
          Sources: ['/source/'],
          Settings: [{ Name: '--no-encryption', Value: 'true' }],
          Filters: [],
          Metadata: {},
          OperationType: 'Backup',
        },
        Schedule: null,
        ApplicationOptions: [],
      },
    })
  );
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/new/destination');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByPlaceholder('Search for destination...', { exact: true })).toBeVisible();
}

test('the backup destination step switches between specifying a destination and the saved ones', async ({
  authenticatedPage: page,
}) => {
  await openDestination(page, saved);
  const search = page.getByPlaceholder('Search for destination...', { exact: true });
  const savedList = page.getByRole('region', { name: 'Saved destinations', exact: true });
  const toggle = page.locator('app-destination sh-button-group.destination-source');
  await expect(toggle.getByRole('button')).toHaveText([/Specify destination/, /Saved destinations/]);
  await expect(savedList).toHaveCount(0);

  await toggle.getByRole('button', { name: 'Saved destinations', exact: true }).click();
  await expect(search).toHaveCount(0);
  await expect(savedList.locator('app-destination-list-item')).toHaveCount(2);
  await savedList.getByText('Archive storage', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible();
  await expect(toggle).toHaveCount(0);

  // Adding a secondary destination offers the same choice, and can be backed out of
  await page.getByRole('button', { name: 'Add another destination', exact: true }).click();
  await expect(toggle).toBeVisible();
  await expect(savedList.locator('app-destination-list-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(toggle).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toHaveCount(1);

  // Go back leaves adding a destination, then changing a type, then the destination chosen here, before the step
  const goBack = page.getByRole('button', { name: 'Go back', exact: true });
  await page.getByRole('button', { name: 'Add another destination', exact: true }).click();
  await expect(toggle).toBeVisible();
  await goBack.click();
  await expect(toggle).toHaveCount(0);
  await expect(page).toHaveURL('/backup/new/destination');
  // The card header that holds Change is a disabled button, which only Playwright's enabled check minds
  await page.getByRole('button', { name: 'Change', exact: true }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Change destination type', exact: true })).toBeVisible();
  await goBack.click();
  await expect(page.getByRole('heading', { name: 'Change destination type', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL('/backup/new/destination');
  await goBack.click();
  // Back at the list the destination was chosen from
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toHaveCount(0);
  await expect(savedList.locator('app-destination-list-item')).toHaveCount(2);
  await expect(page).toHaveURL('/backup/new/destination');
  await goBack.click();
  await expect(page).toHaveURL('/backup/new/source-data');
});

test('Go back keeps a destination that was configured before the step was opened', async ({
  authenticatedPage: page,
}) => {
  await openDestination(page, saved);
  await page.getByRole('button', { name: 'Saved destinations', exact: true }).click();
  await page.getByText('Archive storage', { exact: true }).click();
  const goBack = page.getByRole('button', { name: 'Go back', exact: true });
  await page.getByRole('link', { name: 'Source Data', exact: true }).click();
  await expect(page).toHaveURL('/backup/new/source-data');
  await page.getByRole('link', { name: 'Destination', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible();
  await goBack.click();
  await expect(page).toHaveURL('/backup/new/source-data');
  await page.getByRole('link', { name: 'Destination', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible();
});

test('the backup destination step has no switch without saved destinations', async ({ authenticatedPage: page }) => {
  await openDestination(page, []);
  await expect(page.locator('sh-button-group.destination-source')).toHaveCount(0);
});
