import { expect, test } from './fixtures/authenticated';

test('secondary synchronization settings survive save, edits and reload', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  let additional = [
    {
      UrlKey: 'interval',
      TargetUrl: 'file:///interval',
      ConnectionStringID: 0,
      Mode: 'interval',
      Interval: '7D',
      Options: { count: 3, future: 'keep' },
    },
    {
      UrlKey: 'counting',
      TargetUrl: 'file:///counting',
      ConnectionStringID: 0,
      Mode: 'counting',
      Interval: null as string | null,
      Options: { count: 5, future: 'keep too' },
    },
  ];
  const saves: unknown[] = [];
  await page.route('**/api/v1/backup/42', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      additional = body.Backup.AdditionalTargetURLs;
      saves.push(body);
      return route.fulfill({ json: {} });
    }
    return route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Secondary synchronization',
          TargetURL: 'file:///primary',
          Sources: ['/source/'],
          Settings: [{ Name: '--no-encryption', Value: 'True' }],
          Filters: [],
          Metadata: {},
          OperationType: 'Backup',
          AdditionalTargetURLs: additional,
        },
        Schedule: null,
      },
    });
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/destination');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const controls = page.locator('.secondary-sync');
  await expect(controls).toHaveCount(2);
  await expect(page.locator('app-destination .destination-card').first().locator('.secondary-sync')).toHaveCount(0);
  await expect(controls.nth(0).getByLabel('Synchronization interval', { exact: true })).toHaveValue('7D');
  await expect(controls.nth(1).getByLabel('Backup count', { exact: true })).toHaveValue('5');
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  await save.click();
  await expect.poll(() => saves.length).toBe(1);
  expect(additional).toEqual([
    expect.objectContaining({ Mode: 'interval', Interval: '7D', Options: { count: 3, future: 'keep' } }),
    expect.objectContaining({ Mode: 'counting', Options: { count: 5, future: 'keep too' } }),
  ]);
  await expect(page.getByText('Backup settings saved.', { exact: true })).toBeVisible();

  await controls.nth(0).locator('sh-select').click();
  await page.locator('li.option').filter({ hasText: 'After a number of successful backups' }).click();
  await controls.nth(0).getByLabel('Backup count', { exact: true }).fill('0');
  await expect(controls.nth(0).getByRole('alert')).toContainText('positive whole number');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await save.click();
  await expect(page.getByText('Invalid synchronization settings', { exact: true })).toBeVisible();
  expect(saves).toHaveLength(1);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await controls.nth(0).getByLabel('Backup count', { exact: true }).fill('4');
  await controls.nth(1).locator('sh-select').click();
  await page.locator('li.option').filter({ hasText: 'After a time interval' }).click();
  await controls.nth(1).getByLabel('Synchronization interval', { exact: true }).fill('2h30m');
  await save.click();
  await expect.poll(() => saves.length).toBe(2);
  expect(additional).toEqual([
    expect.objectContaining({ Mode: 'counting', Options: { count: 4, future: 'keep' } }),
    expect.objectContaining({ Mode: 'interval', Interval: '2h30m', Options: { count: 5, future: 'keep too' } }),
  ]);
  await expect(page.getByText('Backup settings saved.', { exact: true })).toBeVisible();
  const reload = page.reload();
  await expect.poll(() => serverApi.refreshRequests.length).toBe(1);
  await serverApi.refreshRequests[0].fulfill({
    json: { AccessToken: 'reloaded-access-token', RefreshNonce: 'reloaded-nonce' },
  });
  await reload;
  await expect(controls).toHaveCount(2);
  await expect(controls.nth(0).getByLabel('Backup count', { exact: true })).toHaveValue('4');
  await expect(controls.nth(1).getByLabel('Synchronization interval', { exact: true })).toHaveValue('2h30m');
});
