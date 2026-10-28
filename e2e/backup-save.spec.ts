import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function openBackup(page: Page) {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  const saves: Route[] = [];
  await page.route('**/api/v1/backup/42', async (route) => {
    if (route.request().method() === 'PUT') {
      saves.push(route);
      return;
    }
    await route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Saved backup',
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
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/options');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Options', exact: true })).toBeVisible();
  return saves;
}

test('backup save is single-flight and announces pending until success', async ({ authenticatedPage: page }) => {
  const saves = await openBackup(page);
  const submit = page.getByRole('button', { name: 'Submit', exact: true });
  await submit.click();
  await expect.poll(() => saves.length).toBe(1);
  await expect(page.getByRole('status')).toHaveText('Saving backup settings…');
  await expect(submit).toBeDisabled();
  await expect(page.locator('app-backup > section')).toHaveAttribute('inert', '');
  await expect(page.locator('sh-stepper')).toHaveAttribute('inert', '');
  await page.keyboard.press('Enter');
  expect(saves).toHaveLength(1);
  expect(saves[0].request().postDataJSON().Backup).toMatchObject({
    Name: 'Saved backup',
    TargetURL: 'file:///backup',
    Sources: ['/source/'],
  });
  await saves[0].fulfill({ json: {} });
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
});

test('failed backup save keeps the editor usable and retries the current inputs', async ({
  authenticatedPage: page,
}) => {
  const saves = await openBackup(page);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  await saves[0].fulfill({ status: 500, json: { Error: 'Unable to save this backup' } });
  await expect(page.getByRole('alert').filter({ hasText: 'Could not save the backup settings.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeEnabled();
  await expect(page.locator('app-backup > section')).not.toHaveAttribute('inert');
  await page.locator('sh-stepper').getByText('General', { exact: true }).click();
  const name = page.getByPlaceholder('Your backup name');
  await expect(name).toHaveValue('Saved backup');
  await name.fill('Retry name');
  await page.locator('sh-stepper').getByText('Options', { exact: true }).click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].request().postDataJSON().Backup.Name).toBe('Retry name');
  await saves[1].fulfill({ json: {} });
  await expect(page).toHaveURL('/');
});

test('a late save response cannot navigate away from the next page', async ({ authenticatedPage: page }) => {
  const saves = await openBackup(page);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  await page.evaluate(() => {
    history.pushState(null, '', '/restore');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL('/restore');
  // A routed request is paused before the network layer. Fulfill the old response
  // and verify its callback cannot send the user back to the home page.
  await saves[0].fulfill({ json: {} });
  await expect(page).toHaveURL('/restore');
  await expect(page.getByText('Backup settings saved.', { exact: true })).toHaveCount(0);
});
