import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function openEditor(page: Page, step = 'general') {
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
          Name: 'Editable backup',
          Description: '',
          Sources: ['/source/'],
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
  await navigate(page, '/backup/42/' + step);
  await expect(page.locator('app-backup > section')).toBeVisible();
  return saves;
}
const save = (page: Page) => page.getByRole('button', { name: 'Save changes', exact: true });

test('an explicit save action is available on every existing-job editor page', async ({ authenticatedPage: page }) => {
  await openEditor(page);
  for (const step of ['general', 'source-data', 'destination', 'schedule', 'options']) {
    await navigate(page, '/backup/42/' + step);
    await expect(save(page)).toBeVisible();
    await expect(save(page)).toBeEnabled();
  }
});

test('keyboard save is single-flight and preserves the current editor and inputs', async ({
  authenticatedPage: page,
}) => {
  const saves = await openEditor(page);
  const name = page.getByPlaceholder('Your backup name');
  await name.fill('Saved in place');
  await save(page).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => saves.length).toBe(1);
  await expect(save(page)).toBeDisabled();
  await expect(page.locator('app-backup > p[role="status"]')).toHaveText('Saving backup settings…');
  await page.keyboard.press('Enter');
  expect(saves).toHaveLength(1);
  expect(saves[0].request().postDataJSON().Backup.Name).toBe('Saved in place');
  await saves[0].fulfill({ json: {} });
  await expect(page.locator('app-backup > p[role="status"]')).toHaveText('Backup settings saved.');
  await expect(page).toHaveURL('/backup/42/general');
  await expect(name).toHaveValue('Saved in place');
  await expect(save(page)).toBeEnabled();
});

test('a failed explicit save keeps the editor usable and retries current values', async ({
  authenticatedPage: page,
}) => {
  const saves = await openEditor(page, 'schedule');
  await save(page).click();
  await expect.poll(() => saves.length).toBe(1);
  await saves[0].fulfill({ status: 500, json: { Error: 'Cannot save' } });
  await expect(page.getByRole('alert').filter({ hasText: 'Could not save the backup settings.' })).toBeVisible();
  await expect(save(page)).toBeEnabled();
  await expect(page).toHaveURL('/backup/42/schedule');
  await save(page).click();
  await expect.poll(() => saves.length).toBe(2);
  await saves[1].fulfill({ json: {} });
  await expect(page.locator('app-backup > p[role="status"]')).toHaveText('Backup settings saved.');
  await expect(page).toHaveURL('/backup/42/schedule');
});

test('invalid input opens its editor instead of sending a save', async ({ authenticatedPage: page }) => {
  const saves = await openEditor(page);
  await page.getByPlaceholder('Your backup name').fill('');
  await navigate(page, '/backup/42/schedule');
  await save(page).click();
  await expect(page).toHaveURL('/backup/42/general');
  await expect(page.getByText('Validation Error', { exact: true })).toBeVisible();
  expect(saves).toHaveLength(0);
});

test('new backups keep the guided flow without the existing-job save action', async ({ authenticatedPage: page }) => {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/backupdefaults', (route) =>
    route.fulfill({
      json: {
        Backup: {
          Name: '',
          Description: '',
          Sources: [],
          Settings: [],
          TargetURL: '',
          Filters: [],
          Metadata: {},
          OperationType: 'Backup',
        },
        Schedule: null,
        ApplicationOptions: [],
      },
    })
  );
  await navigate(page, '/backup/new/general');
  await expect(page.getByPlaceholder('Your backup name')).toBeVisible();
  await expect(save(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
});
