import type { Page } from '@playwright/test';
import type { BackupAndScheduleInputDto, DestinationTestRequestDto } from '../projects/ngclient/src/app/core/openapi';
import { expect, test } from './fixtures/authenticated';

const maskedUrl = 'ssh://user@example.test/archive?auth-password=********';
const saved = [
  { ID: 7, Name: 'Archive storage', Description: 'Saved archive', BaseUrl: maskedUrl },
  { ID: 8, Name: 'Other credentials', Description: '', BaseUrl: maskedUrl },
];
async function openDestination(page: Page) {
  await page.evaluate(() => {
    history.pushState(null, '', '/restore-from-files/destination');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: /^Backup destination/ })).toBeVisible();
}
test.beforeEach(async ({ page, serverApi }) => {
  // Initialize the shared catch-all routes before these more specific overrides.
  void serverApi;
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
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
          'v2:destination:test',
        ],
      },
    })
  );
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: saved } }));
});

test('keyboard selection uses the saved connection for a read-only test and temporary restore job', async ({
  authenticatedPage: page,
}) => {
  const tests: DestinationTestRequestDto[] = [];
  const creates: BackupAndScheduleInputDto[] = [];
  await page.route('**/api/v2/destination/test', (route) => {
    tests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        Success: true,
        Data: {
          FolderContainsBackupFiles: true,
          FolderContainsEncryptedBackupFiles: false,
          FolderIsEmpty: false,
        },
      },
    });
  });
  await page.route('**/api/v1/backups?temporary=true', (route) => {
    creates.push(route.request().postDataJSON());
    return route.fulfill({ json: { ID: 'temp-7' } });
  });
  await page.route('**/api/v1/backup/temp-7', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: 'temp-7',
          OperationType: 'Backup',
          IsTemporary: true,
          TargetURL: maskedUrl,
          ConnectionStringID: 7,
          Sources: [],
          Settings: [{ Name: '--no-encryption', Value: 'true' }],
          Metadata: {},
        },
      },
    })
  );
  await page.route('**/api/v1/backup/temp-7/filesets', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/backup/temp-7/files?*', (route) => route.fulfill({ json: { Files: [] } }));
  await openDestination(page);
  const select = page.getByRole('button', { name: 'Use saved destination Archive storage', exact: true });
  await select.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('app-restore-destination .current-destination')).toContainText('Archive storage');
  await expect(page.locator('app-restore-destination app-single-destination')).toHaveCount(0);
  await page.getByRole('button', { name: 'Test now', exact: true }).click();
  await expect(page.getByText('Success! Test completed, backup found.', { exact: true })).toBeVisible();
  expect(tests).toHaveLength(1);
  expect(tests[0]).toMatchObject({
    DestinationUrl: maskedUrl,
    ConnectionStringId: 7,
    ReadOnlyTest: true,
    AutoCreate: false,
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL('/restore-from-files/encryption');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL('/restore-draft/temp-7/select-files');
  expect(creates).toHaveLength(1);
  expect(creates[0].Backup).toEqual({
    TargetURL: maskedUrl,
    ConnectionStringID: 7,
    Settings: [{ Name: '--no-encryption', Value: 'true' }],
  });
});

test('changing between saved connections with the same URL resets the previous test result', async ({
  authenticatedPage: page,
}) => {
  const ids: number[] = [];
  await page.route('**/api/v2/destination/test', (route) => {
    ids.push(route.request().postDataJSON().ConnectionStringId);
    return route.fulfill({
      json: { Success: true, Data: { FolderContainsBackupFiles: true, FolderContainsEncryptedBackupFiles: false } },
    });
  });
  await openDestination(page);
  await page.getByRole('button', { name: 'Use saved destination Archive storage', exact: true }).click();
  await page.getByRole('button', { name: 'Test now', exact: true }).click();
  await expect(page.getByText('Success! Test completed, backup found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await page.getByRole('button', { name: 'Use saved destination Other credentials', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Test now', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Test now', exact: true }).click();
  await expect(page.getByText('Success! Test completed, backup found.', { exact: true })).toBeVisible();
  expect(ids).toEqual([7, 8]);
});

test('saved-destination loading errors can be retried without blocking manual setup', async ({
  authenticatedPage: page,
}) => {
  let calls = 0;
  await page.route('**/api/v2/connection-strings', (route) =>
    ++calls === 1
      ? route.fulfill({ status: 500, json: { Error: 'Unavailable' } })
      : route.fulfill({ json: { Success: true, Data: saved } })
  );
  await openDestination(page);
  await expect(page.getByText('Saved destinations could not be loaded.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set target URL', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use saved destination Archive storage', exact: true })).toBeVisible();
});

test('an empty saved-destination list keeps the existing manual URL flow', async ({ authenticatedPage: page }) => {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await openDestination(page);
  await expect(page.getByRole('button', { name: /^Use saved destination/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Set target URL', exact: true }).click();
  await page.locator('#targetUrl').fill('file:///manual-archive');
  await page.getByRole('button', { name: 'Override target URL', exact: true }).click();
  await expect(page.locator('app-restore-destination app-single-destination')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
});
