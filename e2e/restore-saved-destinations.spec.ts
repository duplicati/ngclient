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

for (const encrypted of [false, true]) {
  test(`saved connection and encryption setting survive temporary restore creation (encrypted=${encrypted})`, async ({
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
            FolderContainsEncryptedBackupFiles: encrypted,
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
            Settings: encrypted
              ? [{ Name: '--passphrase', Value: ' secret & + % password ' }]
              : [{ Name: '--no-encryption', Value: 'true' }],
            Metadata: {},
          },
        },
      })
    );
    await page.route('**/api/v1/backup/temp-7/filesets', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v1/backup/temp-7/files?*', (route) => route.fulfill({ json: { Files: [] } }));
    await openDestination(page);
    await page.getByRole('button', { name: 'Saved destinations', exact: true }).click();
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
    if (encrypted) await page.getByLabel('Password', { exact: true }).fill(' secret & + % password ');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL('/restore-draft/temp-7/select-files');
    expect(creates).toHaveLength(1);
    expect(creates[0].Backup).toEqual({
      TargetURL: maskedUrl,
      ConnectionStringID: 7,
      Settings: encrypted
        ? [{ Name: '--passphrase', Value: ' secret & + % password ' }]
        : [{ Name: '--no-encryption', Value: 'true' }],
    });
  });
}

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
  await page.getByRole('button', { name: 'Saved destinations', exact: true }).click();
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
  await page.getByRole('button', { name: 'Saved destinations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use saved destination Archive storage', exact: true })).toBeVisible();
});

test('an empty saved-destination list keeps the existing manual URL flow', async ({ authenticatedPage: page }) => {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await openDestination(page);
  await expect(page.getByRole('button', { name: /^Use saved destination/ })).toHaveCount(0);
  // Without saved destinations there is nothing to switch between
  await expect(page.getByPlaceholder('Search for destination...', { exact: true })).toBeVisible();
  await expect(page.locator('sh-button-group.destination-source')).toHaveCount(0);
  await page.getByRole('button', { name: 'Set target URL', exact: true }).click();
  await page.locator('#targetUrl').fill('file:///manual-archive');
  await page.getByRole('button', { name: 'Override target URL', exact: true }).click();
  await expect(page.locator('app-restore-destination app-single-destination')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
});

test('saved destinations and the new-destination list are shown one at a time', async ({ authenticatedPage: page }) => {
  await openDestination(page);
  const savedChoice = page.getByRole('button', { name: /^Use saved destination/ });
  const search = page.getByPlaceholder('Search for destination...', { exact: true });
  // The page opens on entering a destination by hand
  await expect(search).toBeVisible();
  await expect(savedChoice).toHaveCount(0);
  // The steps keep their distance to the page heading
  const steps = (await page.getByRole('navigation', { name: 'Restore steps' }).boundingBox())!;
  const heading = (await page.getByRole('heading', { name: /^Backup destination/ }).boundingBox())!;
  expect(heading.y - (steps.y + steps.height)).toBeGreaterThanOrEqual(32);
  // The switch spans the list, with entering a destination by hand as its first choice
  const toggle = page.locator('sh-button-group.destination-source');
  await expect(toggle.getByRole('button')).toHaveText([/Specify destination/, /Saved destinations/]);
  await page.getByRole('button', { name: 'Saved destinations', exact: true }).click();
  await expect(savedChoice).toHaveCount(2);
  await expect(search).toHaveCount(0);
  const [toggleBox, listBox] = [
    (await toggle.boundingBox())!,
    (await page.locator('.saved-destinations').boundingBox())!,
  ];
  expect(Math.abs(toggleBox.width - listBox.width)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Specify destination', exact: true }).click();
  await expect(search).toBeVisible();
  await expect(savedChoice).toHaveCount(0);
  await page.getByRole('button', { name: 'Saved destinations', exact: true }).click();
  await expect(savedChoice).toHaveCount(2);
  await expect(search).toHaveCount(0);
});

test('going back leaves a chosen destination first and the destination step second', async ({
  authenticatedPage: page,
}) => {
  await openDestination(page);
  await page.getByRole('button', { name: 'Saved destinations', exact: true }).click();
  await page.getByRole('button', { name: 'Use saved destination Archive storage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  // Back at the list the destination was picked from
  await expect(page).toHaveURL(/\/restore-from-files\/destination$/);
  await expect(page.getByRole('button', { name: 'Use saved destination Archive storage', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page).toHaveURL(/\/restore$/);
  await expect(page.getByRole('heading', { name: 'Where do you want to restore from?', exact: true })).toBeVisible();
});
