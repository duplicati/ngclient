import { expect, test } from './fixtures/authenticated';

for (const os of ['Linux', 'Windows']) {
  test(`${os}: selecting Folder before entering its path survives saving and reloading`, async ({
    authenticatedPage: page,
  }) => {
    const delimiter = os === 'Windows' ? '\\' : '/';
    const folder = os === 'Windows' ? 'C:\\test\\test' : '/test/test';
    let stored = {
      Backup: {
        ID: '42',
        Name: 'Folder filter test',
        Description: '',
        Sources: [os === 'Windows' ? 'C:\\test\\' : '/test/'],
        TargetURL: 'file:///remote',
        Settings: [{ Name: '--no-encryption', Value: 'true' }],
        Filters: [] as { Order: number; Include: boolean; Expression: string }[],
        Metadata: {},
        OperationType: 'Backup',
      },
      Schedule: null,
    };
    const saves: unknown[] = [];
    await page.route('**/api/v1/systeminfo', (route) =>
      route.fulfill({
        json: {
          OSType: os,
          DirectorySeparator: delimiter,
          BackendModules: [],
          EncryptionModules: [],
          CompressionModules: [],
          GenericModules: [],
          Options: [],
          ServerOnlyOptions: [],
          SpecialFolders: [],
          APIExtensions: [
            'v1:websocket',
            'v1:websocket:authenticate',
            'v1:subscribe:backuplist',
            'v1:subscribe:notifications',
            'v1:subscribe:remotecontrol',
          ],
        },
      })
    );
    await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
    await page.route('**/api/v1/backup/42', (route) => {
      if (route.request().method() === 'PUT') {
        stored = route.request().postDataJSON();
        saves.push(stored.Backup.Filters);
        return route.fulfill({ json: {} });
      }
      return route.fulfill({ json: stored });
    });
    await page.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({ json: { AccessToken: 'fixture-access-token', RefreshNonce: 'fixture-refresh-nonce' } })
    );

    await page.goto('/backup/42/source-data');
    const filters = page.locator('app-filters');
    await filters.getByRole('button', { name: 'Add filter', exact: true }).click();
    const type = filters.locator('app-new-filter sh-select input');
    const input = filters.locator('app-new-filter > sh-form-field input');
    await filters.locator('app-new-filter sh-select').click();
    await page
      .locator('li.option')
      .filter({ hasText: /^\s*Excludes folder\s*$/ })
      .click();
    await expect(type).toHaveValue('-Folder');
    await input.fill('');
    await input.pressSequentially(folder);
    await expect(type).toHaveValue('-Folder');
    await expect(input).toHaveValue(folder);

    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Backup settings saved.', { exact: true })).toBeVisible();
    expect(saves).toEqual([[{ Order: 0, Include: false, Expression: folder + delimiter }]]);
    await page.reload();
    await expect(type).toHaveValue('-Folder');
    await expect(input).toHaveValue(folder);
  });
}
