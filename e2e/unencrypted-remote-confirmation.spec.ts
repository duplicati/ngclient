import { expect, test } from './fixtures/authenticated';

test('canceling unencrypted remote creation sends no request and explicit confirmation saves it', async ({
  authenticatedPage: page,
}) => {
  const saves: unknown[] = [];
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/backupdefaults', (route) =>
    route.fulfill({
      json: {
        Backup: {
          Name: 'Remote without encryption',
          Description: '',
          TargetURL: 's3://fixture-bucket/archive',
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
  await page.route('**/api/v1/backups', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    saves.push(route.request().postDataJSON());
    return route.fulfill({ json: { ID: '77' } });
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/new/options');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'No encryption', exact: true }) });
  await expect(dialog).toBeVisible();
  expect(saves).toEqual([]);
  await page.screenshot({ path: 'tmp/eight-prs-20261118/encryption.png' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expect(dialog).not.toBeVisible();
  expect(saves).toEqual([]);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue without encryption', exact: true }).press('Enter');
  await expect(page).toHaveURL('/');
  expect(saves).toHaveLength(1);
});
