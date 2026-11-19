import type { Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

test('direct restore URL edits are isolated until applied and preserve the exact submitted URL', async ({
  authenticatedPage: page,
}) => {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  const creates: Route[] = [];
  await page.route('**/api/v1/backups?temporary=true', (route) => {
    creates.push(route);
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/restore-from-files/destination');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const open = page.getByRole('button', { name: 'Set target URL', exact: true });
  await open.click();
  await expect(page.locator('#targetUrl')).toHaveValue('');
  await page.locator('#targetUrl').fill('file:///cancelled');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await open.click();
  await expect(page.locator('#targetUrl')).toHaveValue('');
  const url = 'file:///archive?custom=a%2Bb&other=a%26b';
  await page.locator('#targetUrl').fill(url);
  await page.getByRole('button', { name: 'Override target URL', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip test and continue', exact: true }).click();
  await expect(page).toHaveURL('/restore-from-files/encryption');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => creates.length).toBe(1);
  expect(creates[0].request().postDataJSON().Backup.TargetURL).toBe(url);
});

test.describe('Duplicati Storage direct restore', () => {
  test.beforeEach(async ({ page, serverApi }) => {
    void serverApi;
    await page.route('**/api/v1/systeminfo', (route) =>
      route.fulfill({
        json: {
          Version: 'Browser test',
          DirectorySeparator: '/',
          BackendModules: [
            {
              Key: 'duplicati',
              Options: [
                { Name: 'duplicati-backup-id', Type: 'String' },
                { Name: 'duplicati-auth-apiid', Type: 'String' },
                { Name: 'duplicati-auth-apikey', Type: 'Password' },
              ],
            },
          ],
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
  });

  test('uses the selected backup ID as the restore source', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
    await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v1/webmodule/duplicati-list-backups', (route) =>
      route.fulfill({ json: { Result: { folders: JSON.stringify(['first', 'second & archive']) } } })
    );
    const pendingCreate = page.waitForRequest('**/api/v1/backups?temporary=true');
    const url = 'duplicati://?duplicati-auth-apiid=fixture-id&duplicati-auth-apikey=fixture-key';
    await page.route('**/api/v1/backups?temporary=true', (route) => route.fulfill({ json: { ID: 'storage-temp' } }));
    await page.route('**/api/v1/backup/storage-temp', (route) =>
      route.fulfill({
        json: { Backup: { ID: 'storage-temp', IsTemporary: true, Sources: ['/archive/'], Settings: [] } },
      })
    );
    await page.route('**/api/v1/backup/storage-temp/isactive', (route) => route.fulfill({ json: { Active: false } }));
    await page.route('**/api/v1/backup/storage-temp/repairupdate', (route) => route.fulfill({ json: { ID: 41 } }));
    await page.route('**/api/v1/task/41', (route) =>
      route.fulfill({ json: { ID: 41, Status: 'Completed', TaskFinished: '2026-11-19T12:00:01Z' } })
    );
    await page.route('**/api/v2/backup/list-filesets', (route) =>
      route.fulfill({ json: { Success: true, Data: [{ Version: 0, Time: '2026-11-19T12:00:00Z' }] } })
    );
    await page.route('**/api/v2/backup/list-folder', (route) => {
      const root = route.request().postDataJSON().Paths === null;
      const entry = root
        ? { Path: '/archive/', IsDirectory: true, Size: -1 }
        : { Path: '/archive/second.txt', IsDirectory: false, Size: 20 };
      return route.fulfill({ json: { Success: true, Data: [entry] } });
    });
    await page.route('**/api/v1/backup/storage-temp/copytotemp', (route) =>
      route.fulfill({ json: { ID: 'storage-restore' } })
    );
    await page.route('**/api/v1/backup/storage-restore/restore', () => {
      // Hold the response because this test ends at submission.
    });
    await page.evaluate(() => {
      history.pushState(null, '', '/restore-from-files/destination');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.getByRole('button', { name: 'Set target URL', exact: true }).click();
    await page.locator('#targetUrl').fill(url);
    await page.getByRole('button', { name: 'Override target URL', exact: true }).click();
    const picker = page.getByRole('combobox', { name: /Pick the backup to restore from/ });
    await expect(picker).toHaveValue('');
    await picker.selectOption('second & archive');
    await expect(picker).toHaveValue('second & archive');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Skip test and continue', exact: true }).click();
    await expect(page).toHaveURL('/restore-from-files/encryption');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const request = await pendingCreate;
    const parameters = new URL(request.postDataJSON().Backup.TargetURL).searchParams;
    expect(parameters.get('duplicati-backup-id')).toBe('second & archive');
    expect(parameters.get('duplicati-auth-apiid')).toBe('fixture-id');
    expect(parameters.get('duplicati-auth-apikey')).toBe('fixture-key');
    await expect(page).toHaveURL('/restore-draft/storage-temp/select-files');
    const file = page.getByRole('treeitem', { name: 'second.txt', exact: true });
    await file.click();
    await expect(file).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const pendingRestore = page.waitForRequest('**/api/v1/backup/storage-restore/restore');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    const restore = await pendingRestore;
    expect(restore.postDataJSON().paths).toEqual(['/archive/second.txt']);
  });
});
