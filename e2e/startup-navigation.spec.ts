import { expect, test } from './fixtures/authenticated';

test('a cold backup editor still supports direct navigation and browser history', async ({
  authenticatedPage: page,
}) => {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Cold editor',
          Description: '',
          Sources: ['/source/'],
          TargetURL: 'file:///backup',
          Settings: [{ Name: '--no-encryption', Value: 'True' }],
          Filters: [],
          Metadata: {},
          OperationType: 'Backup',
        },
        Schedule: null,
      },
    })
  );
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/general');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByPlaceholder('Your backup name')).toHaveValue('Cold editor');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByPlaceholder('Your backup name')).toHaveValue('Cold editor');
});
