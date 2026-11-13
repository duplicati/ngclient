import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function openAddBackup(page: Page) {
  // Set up through the sidebar without depending on its button/link migration.
  const sidebar = page.locator('app-layout [sidenav]');
  await sidebar
    .getByRole('button', { name: 'Add backup', exact: true })
    .or(sidebar.getByRole('link', { name: 'Add backup', exact: true }))
    .click();
  await expect(page).toHaveURL('/add-backup');
  await expect(page.getByRole('heading', { name: 'Add a new backup', exact: true })).toBeVisible();
}

const links = [
  ['Add a new backup', '/backup/new'],
  ['Import from file', '/backup/import'],
  ['Import from destination', '/backup/import-destination'],
] as const;

test('keeps remote import hidden when the server does not advertise support', async ({ authenticatedPage: page }) => {
  await openAddBackup(page);
  const screen = page.locator('app-add-backup');
  await expect(screen.locator('.backup-types').getByRole('link')).toHaveCount(2);
  await expect(screen.getByRole('link', { name: 'Import from destination', exact: true })).toHaveCount(0);
  await expect(screen.locator('sh-card')).toHaveCount(2);
});

test.describe('server supports remote configuration import', () => {
  test.beforeEach(async ({ page, serverApi }) => {
    // Install after the shared API fixture, before authenticatedPage loads systeminfo.
    void serverApi;
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
          Options: [],
          ServerOnlyOptions: [],
          SpecialFolders: [],
          APIExtensions: [
            'v1:websocket',
            'v1:websocket:authenticate',
            'v1:subscribe:backuplist',
            'v1:subscribe:notifications',
            'v1:subscribe:remotecontrol',
            'v1:backup:restorecontrolfiles',
          ],
        },
      })
    );
    await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
    await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
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
  });

  test('exposes three styled navigation links when supported', async ({ authenticatedPage: page }) => {
    await openAddBackup(page);
    const screen = page.locator('app-add-backup');
    await expect(screen.locator('.backup-types').getByRole('link')).toHaveCount(3);
    for (const [name, href] of links) {
      const link = screen.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveClass(/raised/);
      await expect(link).toHaveCSS('text-decoration-line', 'none');
    }
    await expect(screen.locator('.three-column sh-card')).toHaveCount(3);
    await test.info().attach('add-backup', { body: await screen.screenshot(), contentType: 'image/png' });
  });

  test('supports Tab/Enter, SPA file-import navigation and browser history', async ({
    authenticatedPage: page,
    serverApi,
  }) => {
    await openAddBackup(page);
    const screen = page.locator('app-add-backup');
    const document = await page.locator('html').elementHandle();
    await screen.getByRole('link', { name: 'Add a new backup', exact: true }).focus();
    await page.keyboard.press('Tab');
    const file = screen.getByRole('link', { name: 'Import from file', exact: true });
    await expect(file).toBeFocused();
    await expect(file).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/backup/import');
    await expect(page.getByRole('heading', { name: /Import backup configuration/ })).toBeVisible();
    expect(await document!.evaluate((element) => element.isConnected)).toBe(true);
    await page.goBack();
    await expect(page).toHaveURL('/add-backup');
    await page.goForward();
    await expect(page).toHaveURL('/backup/import');
    expect(serverApi.refreshRequests).toHaveLength(0);
  });

  test('keeps the new-backup redirect and editor initialization', async ({ authenticatedPage: page }) => {
    await openAddBackup(page);
    await page.locator('app-add-backup').getByRole('link', { name: 'Add a new backup', exact: true }).click();
    await expect(page).toHaveURL('/backup/new/general');
    await expect(page.getByPlaceholder('Your backup name')).toBeVisible();
  });

  test('keeps the remote-import redirect and destination picker', async ({ authenticatedPage: page }) => {
    await openAddBackup(page);
    await page.locator('app-add-backup').getByRole('link', { name: 'Import from destination', exact: true }).click();
    await expect(page).toHaveURL('/backup/import-destination/destination');
    await expect(page.getByRole('button', { name: 'Set target URL', exact: true })).toBeVisible();
  });

  for (const activation of ['ControlOrMeta', 'middle'] as const) {
    test(`opens file import in a separate tab with ${activation}`, async ({ authenticatedPage: page, context }) => {
      await openAddBackup(page);
      // Test browser link handling independently of authentication in the new tab.
      await context.route('**/backup/import', (route) =>
        route.request().isNavigationRequest()
          ? route.fulfill({ contentType: 'text/html', body: '<title>Import navigation target</title>' })
          : route.continue()
      );
      const popupPromise = context.waitForEvent('page');
      const link = page.locator('app-add-backup').getByRole('link', { name: 'Import from file', exact: true });
      if (activation === 'middle') await link.click({ button: 'middle' });
      else await link.click({ modifiers: [activation] });
      const popup = await popupPromise;
      await expect(popup).toHaveURL('/backup/import');
      await expect(popup).toHaveTitle('Import navigation target');
      await expect(page).toHaveURL('/add-backup');
      await popup.close();
    });
  }
});
