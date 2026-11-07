import { type Page, type Route } from '@playwright/test';
import type { RestoreInputDto } from '../projects/ngclient/src/app/core/openapi';
import { expect, test } from './fixtures/authenticated';

const newest = '2026-11-06T12:00:00Z';
const older = '2026-11-01T12:00:00Z';
const started = '2026-11-07T12:00:00Z';
const taskId = 73;

async function openRestore(page: Page, loginRequests: Route[], separator: string, source: string) {
  await page.route('**/api/v1/systeminfo', (route) =>
    route.fulfill({
      json: {
        Version: 'Browser test',
        DirectorySeparator: separator,
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
          Name: 'Restore lifecycle',
          OperationType: 'Backup',
          IsTemporary: false,
          DBPathExists: true,
          Sources: [source],
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
          { Version: 0, Time: newest },
          { Version: 7, Time: older },
        ],
      },
    })
  );
  const sourceSeparator = source.startsWith('/') ? '/' : '\\';
  const folder = source + 'photos' + sourceSeparator;
  const listings: { Time: string; Paths: string[] | null }[] = [];
  const entry = (Path: string, IsDirectory = false) => ({
    Path,
    IsDirectory,
    Size: IsDirectory ? -1 : 20,
    Metadata: null,
  });
  await page.route('**/api/v2/backup/list-folder', (route) => {
    const body = route.request().postDataJSON();
    listings.push(body);
    const Data =
      body.Paths === null
        ? [entry(source, true)]
        : body.Paths[0] === folder
          ? [entry(folder + 'photo.jpg')]
          : [
              entry(source + (body.Time === older ? 'report.txt' : 'current.txt')),
              entry(folder, true),
              entry(source + 'unselected.txt'),
            ];
    return route.fulfill({ json: { Success: true, Data, PageInfo: {} } });
  });
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/logdata/poll*', (route) => route.fulfill({ json: [] }));
  const restores: Route[] = [];
  await page.route('**/api/v1/backup/42/restore', (route) => {
    restores.push(route);
  });
  const tasks: Route[] = [];
  await page.route(`**/api/v1/task/${taskId}`, (route) => {
    tasks.push(route);
  });
  await page.goto('/login');
  await page.getByPlaceholder('Enter your password').fill('browser-test-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect.poll(() => loginRequests.length).toBe(1);
  await loginRequests[0].fulfill({ json: { AccessToken: 'restore-test-token', RefreshNonce: 'restore-test-nonce' } });
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  await page.evaluate(() => {
    history.pushState(null, '', '/restore/42/select-files');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Select files', exact: true })).toBeVisible();
  return { folder, listings, restores, tasks };
}

async function selectOlderFiles(page: Page) {
  const tree = page.getByRole('tree', { name: 'Files and folders', exact: true });
  await expect(tree.getByRole('treeitem', { name: 'current.txt', exact: true })).toBeVisible();
  await page.locator('app-select-files sh-select').click();
  await page.locator('li.option').filter({ hasText: '7:' }).click();
  const file = tree.getByRole('treeitem', { name: 'report.txt', exact: true });
  const folder = tree.getByRole('treeitem', { name: 'photos', exact: true });
  await expect(file).toBeVisible();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');
  await file.click();
  await folder.click();
  await expect(file).toHaveAttribute('aria-checked', 'true');
  await expect(folder).toHaveAttribute('aria-checked', 'true');
  await folder.locator('.icon').first().click();
  await expect(folder).toHaveAttribute('aria-expanded', 'true');
  await expect(tree.getByRole('treeitem', { name: 'photo.jpg', exact: true })).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: 'unselected.txt', exact: true })).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Restore options', exact: true })).toBeVisible();
}

async function chooseDestination(page: Page, destination: string) {
  await page.locator('sh-radio').filter({ hasText: 'Pick location' }).click();
  await page.getByRole('button', { name: 'Manually type path', exact: true }).click();
  await page.locator('[formcontrolname=restoreFromPath]').fill(destination);
}

async function completeTask(page: Page, restores: Route[], tasks: Route[], failed = false) {
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => restores.length).toBe(1);
  await restores[0].fulfill({ json: { ID: taskId } });
  await expect(page).toHaveURL(`/restore/42/${taskId}/progress`);
  await expect.poll(() => tasks.length).toBe(1);
  await tasks[0].fulfill({ json: { ID: taskId, Status: 'Running', TaskStarted: started, TaskFinished: null } });
  await expect(page.getByRole('heading', { name: /Restore progress:/ })).toBeVisible();
  await expect.poll(() => tasks.length).toBe(2);
  await tasks[1].fulfill({
    json: {
      ID: taskId,
      Status: failed ? 'Failed' : 'Completed',
      TaskStarted: started,
      TaskFinished: '2026-11-07T12:00:10Z',
      ErrorMessage: failed ? 'Restore failed' : null,
    },
  });
  await expect(page.locator('sh-card').filter({ hasText: 'Restore completed' })).toBeVisible();
  await expect(page.locator(failed ? '.complete-failure' : '.complete-success')).toBeVisible();
  await expect(page.locator(failed ? '.complete-success' : '.complete-failure')).toHaveCount(0);
  return restores[0].request().postDataJSON() as RestoreInputDto;
}

for (const scenario of [
  {
    name: 'Unix backup on Windows',
    separator: '\\',
    source: '/archive/',
    destination: 'C:\\restored',
    overwrite: false,
  },
  {
    name: 'Windows backup on Unix',
    separator: '/',
    source: 'C:\\Archive\\',
    destination: '/restored',
    overwrite: true,
  },
]) {
  test(`restores an older version with an exact file and recursive folder: ${scenario.name}`, async ({
    page,
    serverApi,
  }) => {
    const { folder, listings, restores, tasks } = await openRestore(
      page,
      serverApi.loginRequests,
      scenario.separator,
      scenario.source
    );
    await selectOlderFiles(page);
    expect(listings.filter((x) => x.Time === older)).toEqual(
      expect.arrayContaining([expect.objectContaining({ Paths: null }), expect.objectContaining({ Paths: [folder] })])
    );
    await chooseDestination(page, scenario.destination);
    if (scenario.overwrite) {
      await page.locator('sh-radio').filter({ hasText: 'Overwrite' }).click();
    } else {
      await expect(page.locator('[formcontrolname=handleExisting][value=saveTimestamp]')).toBeChecked();
    }
    const body = await completeTask(page, restores, tasks);
    expect(body).toMatchObject({
      time: older,
      restore_path: scenario.destination,
      overwrite: scenario.overwrite,
      permissions: false,
      skip_metadata: false,
      source_prefix: null,
      connection_string_id: null,
    });
    expect(body.paths).toHaveLength(2);
    expect(body.paths).toEqual(expect.arrayContaining([scenario.source + 'report.txt', folder + '*']));
    expect(body.paths).not.toContain(scenario.source + 'unselected.txt');
  });
}

test('shows a failed restore task as a failure rather than a successful completion', async ({ page, serverApi }) => {
  const { restores, tasks } = await openRestore(page, serverApi.loginRequests, '/', '/archive/');
  await selectOlderFiles(page);
  await chooseDestination(page, '/restored');
  const body = await completeTask(page, restores, tasks, true);
  expect(body.time).toBe(older);
});
