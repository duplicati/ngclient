import { expect, test } from './fixtures/authenticated';

const latest = '2026-10-01T12:00:00Z';
const older = '2026-09-24T12:00:00Z';
const result = (version: number, time: string) => ({
  Version: version,
  Time: time,
  Path: '/data/report.txt',
  Size: 12,
  IsDirectory: false,
  IsSymlink: false,
  LastModified: time,
  Metadata: null,
});

test.beforeEach(async ({ page, serverApi }) => {
  void serverApi;
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/systeminfo', (route) =>
    route.fulfill({
      json: {
        Version: 'Browser test',
        DirectorySeparator: '/',
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
          'v2:backup:list-filesets',
          'v2:backup:list-folder',
        ],
      },
    })
  );
  await page.route('**/api/v1/backup/42/isactive', (route) => route.fulfill({ json: { Active: false } }));
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Search test',
          OperationType: 'Backup',
          IsTemporary: false,
          DBPathExists: true,
          Sources: ['/data/'],
          Settings: [],
          Metadata: {},
        },
      },
    })
  );
  await page.route('**/api/v2/backup/list-filesets', (route) =>
    route.fulfill({
      json: {
        Success: true,
        Data: [
          { Version: 0, Time: latest },
          { Version: 7, Time: older },
        ],
      },
    })
  );
  await page.route('**/api/v2/backup/list-folder', (route) =>
    route.fulfill({
      json: {
        Success: true,
        Data: [{ Path: '/data/', IsDirectory: true, Size: -1 }],
        PageInfo: {},
      },
    })
  );
});

test('selects an older search hit and submits its timestamp and exact path for restore', async ({
  authenticatedPage: page,
}) => {
  const searches: Record<string, unknown>[] = [];
  await page.route('**/api/v2/backup/search', (route) => {
    searches.push(route.request().postDataJSON());
    return route.fulfill({
      json: { Success: true, Data: [result(1, latest), result(8, older)], PageInfo: { Pages: 1 } },
    });
  });
  let restore: Record<string, unknown> | undefined;
  await page.route('**/api/v1/backup/42/restore', (route) => {
    restore = route.request().postDataJSON();
    // Keep the options screen open so the test need not mock the progress screen.
    return route.fulfill({ status: 500, json: { Message: 'Stop after verifying the restore request' } });
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/restore/42/select-files');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByLabel('Search all versions', { exact: true }).check();
  await page.getByLabel('Search files', { exact: true }).fill('*report*');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const hits = page.locator('.version-results li');
  await expect(hits).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  expect(searches).toEqual([expect.objectContaining({ Version: null, Time: null })]);
  await hits.nth(1).getByRole('button', { name: 'Select this version', exact: true }).click();
  await expect(page.locator('input[formcontrolname=filesToRestore]')).toHaveValue('/data/report.txt');
  await expect(page.locator('app-select-files sh-select input')).toHaveValue('7');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Restore options', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => restore).toEqual(expect.objectContaining({ time: older, paths: ['/data/report.txt'] }));
});

test('pages through version hits and clears stale results when changing the search scope', async ({
  authenticatedPage: page,
}) => {
  const pages: number[] = [];
  await page.route('**/api/v2/backup/search', (route) => {
    const request = route.request().postDataJSON();
    pages.push(request.Page);
    return route.fulfill({
      json: { Success: true, Data: [result(request.Page, request.Page ? older : latest)], PageInfo: { Pages: 2 } },
    });
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/restore/42/select-files');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByLabel('Search all versions', { exact: true }).check();
  await page.getByLabel('Search files', { exact: true }).fill('*report*');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Next results', exact: true }).click();
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  expect(pages).toEqual([0, 1]);
  await page.getByLabel('Search all versions', { exact: true }).uncheck();
  await expect(page.locator('.version-results')).toHaveCount(0);
});
