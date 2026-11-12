import { expect, test } from './fixtures/authenticated';

for (const attributes of ['hidden,system', ' hIdDeN , SYSTEM ']) {
  test(`editing a legacy backup retains attribute exclusions: ${attributes}`, async ({ page, serverApi }) => {
    await page.route('**/api/v1/systeminfo', (route) =>
      route.fulfill({
        json: {
          Version: 'Browser test',
          DefaultUsageReportLevel: 'information',
          StartedBy: 'TrayIcon',
          BackendModules: [],
          EncryptionModules: [],
          CompressionModules: [],
          GenericModules: [],
          ServerOnlyOptions: [],
          SpecialFolders: [],
          Options: [
            { Name: 'dry-run', Type: 'Boolean', ShortDescription: 'Dry run' },
            {
              Name: 'exclude-files-attributes',
              Type: 'Flags',
              ShortDescription: 'Exclude file attributes',
              ValidValues: ['Hidden', 'System', 'Archive'],
            },
          ],
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
    await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
    let settings = [
      { Name: '--no-encryption', Value: 'True' },
      { Name: '--dry-run', Value: 'YES' },
      { Name: '--exclude-files-attributes', Value: attributes },
    ];
    let saves = 0;
    await page.route('**/api/v1/backup/42', async (route) => {
      if (route.request().method() === 'PUT') {
        settings = route.request().postDataJSON().Backup.Settings;
        saves++;
        return route.fulfill({ json: {} });
      }
      return route.fulfill({
        json: {
          Backup: {
            ID: '42',
            Name: 'Legacy attribute exclusions',
            Sources: ['/source/'],
            TargetURL: 'file:///backup',
            Settings: settings,
            Filters: [],
            Metadata: {},
            OperationType: 'Backup',
          },
          Schedule: null,
        },
      });
    });
    await page.goto('/login');
    await page.getByPlaceholder('Enter your password').fill('browser-test-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect.poll(() => serverApi.loginRequests.length).toBe(1);
    await serverApi.loginRequests[0].fulfill({
      json: { AccessToken: 'fixture-access-token', RefreshNonce: 'fixture-refresh-nonce' },
    });
    await expect(page).toHaveURL('/');
    async function openOptions(expected = ['Hidden', 'System']) {
      await page.evaluate(() => {
        history.pushState(null, '', '/backup/42/options');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      const flags = page.locator('app-options-list sh-select').filter({ hasText: 'Exclude file attributes' });
      await expect(flags.locator('sh-chip')).toHaveText(expected.map((value) => new RegExp(value)));
      await expect(flags.locator('input')).toHaveValue(expected.join(','));
    }
    await openOptions();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => saves).toBe(1);
    expect(
      settings
        .find((setting) => setting.Name === '--exclude-files-attributes')
        ?.Value.split(',')
        .map((value) => value.trim().toLowerCase())
    ).toEqual(['hidden', 'system']);
    await expect(page).toHaveURL('/');
    await openOptions();
    expect(saves).toBe(1);
    expect(settings.find((setting) => setting.Name === '--exclude-files-attributes')?.Value).toBe(attributes);
    expect(settings.find((setting) => setting.Name === '--dry-run')?.Value).toBe('YES');
    const dryRun = page.locator('app-options-list sh-toggle').filter({ hasText: 'Dry run' });
    const toggle = dryRun.locator('input');
    await expect(toggle).toBeChecked();
    await dryRun.click();
    const flags = page.locator('app-options-list sh-select').filter({ hasText: 'Exclude file attributes' });
    await flags.click();
    await page.getByRole('option').filter({ hasText: 'Archive' }).click();
    await page.keyboard.press('Escape');
    await expect(flags.locator('sh-chip')).toHaveText([/Hidden/, /System/, /Archive/]);
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => saves).toBe(2);
    expect(settings.find((setting) => setting.Name === '--exclude-files-attributes')?.Value).toBe(
      'Hidden,System,Archive'
    );
    await expect(page).toHaveURL('/');
    expect(settings.find((setting) => setting.Name === '--dry-run')?.Value).toBe('False');
    await openOptions(['Hidden', 'System', 'Archive']);
    await expect(toggle).not.toBeChecked();
  });
}
