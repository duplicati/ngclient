import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

for (const { attributes, interaction } of [
  { attributes: 'hidden,system', interaction: 'mouse' },
  { attributes: ' hIdDeN , SYSTEM ', interaction: 'mouse' },
  { attributes: null, interaction: 'mouse' },
  { attributes: null, interaction: 'keyboard' },
] as const) {
  const title =
    attributes === null
      ? `adding an attribute exclusion with ${interaction}`
      : `editing a legacy backup retains attribute exclusions: ${attributes}`;
  test(title, async ({ page, serverApi }) => {
    async function activate(button: Locator) {
      await expect(button).toBeEnabled();
      if (interaction === 'keyboard') {
        await button.focus();
        await page.keyboard.press('Enter');
      } else {
        await button.click();
      }
    }
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
      ...(attributes === null ? [] : [{ Name: '--exclude-files-attributes', Value: attributes }]),
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
      await expect(page.locator('app-options-list sh-toggle').filter({ hasText: 'Dry run' })).toBeVisible();
      const flags = page.locator('app-options-list sh-select').filter({ hasText: 'Exclude file attributes' });
      if ((await flags.count()) === 0) {
        const add = page.getByRole('button', { name: 'Add advanced option', exact: true });
        await expect(add).toBeEnabled();
        if (interaction === 'keyboard') {
          await page
            .getByRole('navigation', { name: 'Backup steps' })
            .getByRole('link', { name: 'Options', exact: true })
            .focus();
          for (let i = 0; i < 20 && !(await add.evaluate((element) => element === document.activeElement)); i++) {
            await page.keyboard.press('Tab');
          }
          await expect(add).toBeFocused();
          await page.keyboard.press('Enter');
        } else {
          await add.click();
        }
        const search = page.getByPlaceholder('Search', { exact: true });
        await search.fill('exclude-files-attributes');
        const option = page.getByRole('option', { name: /exclude-files-attributes/ });
        await expect(option).toBeEnabled();
        if (interaction === 'keyboard') {
          await option.focus();
          await page.keyboard.press('Enter');
        } else {
          await option.click();
        }
        await flags.click();
        await page.getByRole('option').filter({ hasText: 'Hidden' }).click();
        await page.getByRole('option').filter({ hasText: 'System' }).click();
        await page.keyboard.press('Escape');
      }
      await expect(flags.locator('sh-chip')).toHaveText(expected.map((value) => new RegExp(value)));
      await expect(flags.locator('input')).toHaveValue(expected.join(','));
    }
    await openOptions();
    if (attributes === null) {
      await activate(page.getByRole('button', { name: 'More advanced option actions', exact: true }));
      const editAsText = page.getByRole('button', { name: 'Edit contents as text', exact: true });
      await expect(editAsText).toBeEnabled();
      if (interaction === 'keyboard') {
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('button', { name: 'New custom option', exact: true })).toHaveClass(/active/);
        await page.keyboard.press('ArrowDown');
        await expect(editAsText).toHaveClass(/active/);
        await page.keyboard.press('Enter');
      } else {
        await editAsText.click();
      }
      await expect(page.locator('app-options-list textarea')).toHaveValue(/exclude-files-attributes=Hidden,System/);
      await activate(page.getByRole('button', { name: 'Show editor', exact: true }));
      await expect(
        page.locator('app-options-list sh-select').filter({ hasText: 'Exclude file attributes' }).locator('sh-chip')
      ).toHaveText([/Hidden/, /System/]);
    }
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => saves).toBe(1);
    expect(
      settings
        .find((setting) => setting.Name.replace(/^--/, '') === 'exclude-files-attributes')
        ?.Value.split(',')
        .map((value) => value.trim().toLowerCase())
    ).toEqual(['hidden', 'system']);
    await expect(page).toHaveURL('/');
    await openOptions();
    expect(saves).toBe(1);
    expect(settings.find((setting) => setting.Name.replace(/^--/, '') === 'exclude-files-attributes')?.Value).toBe(
      attributes ?? 'Hidden,System'
    );
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
    expect(settings.find((setting) => setting.Name.replace(/^--/, '') === 'exclude-files-attributes')?.Value).toBe(
      'Hidden,System,Archive'
    );
    await expect(page).toHaveURL('/');
    expect(settings.find((setting) => setting.Name === '--dry-run')?.Value).toBe('False');
    await openOptions(['Hidden', 'System', 'Archive']);
    await expect(toggle).not.toBeChecked();
  });
}
