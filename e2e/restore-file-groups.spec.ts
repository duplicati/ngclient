import { expect, test } from './fixtures/authenticated';

const latest = '2026-11-14T00:00:00Z';
const older = '2026-11-07T00:00:00Z';
const files = ['/data/one.txt', '/data/two.txt', '/data/sub/three.txt'];
const oldFiles = ['/data/old-one.txt', '/data/old-two.txt'];

test.beforeEach(async ({ page, serverApi }) => {
  void serverApi;
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
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/backup/42/isactive', (route) => route.fulfill({ json: { Active: false } }));
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Individual files',
          OperationType: 'Backup',
          IsTemporary: false,
          DBPathExists: true,
          Sources: [...files, '/saved/'],
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
});

for (const version of ['latest', 'older'] as const) {
  test(`restores saved file paths from a keyboard-selected ${version} group, not its synthetic parent`, async ({
    authenticatedPage: page,
  }) => {
    const listings: { Paths: string[] | null; Time: string }[] = [];
    await page.route('**/api/v2/backup/list-folder', (route) => {
      const body = route.request().postDataJSON();
      listings.push(body);
      const paths = body.Time === older ? oldFiles : files;
      return route.fulfill({
        json: {
          Success: true,
          Data:
            body.Paths === null
              ? [...paths, '/saved/'].map((Path) => ({ Path, IsDirectory: Path.endsWith('/'), Size: -1 }))
              : [],
        },
      });
    });
    let restore: { paths: string[]; time: string } | undefined;
    await page.route('**/api/v1/backup/42/restore', (route) => {
      restore = route.request().postDataJSON();
      return route.fulfill({ status: 500, json: { Message: 'Stop after inspecting the restore payload' } });
    });
    await page.evaluate(() => {
      history.pushState(null, '', '/restore/42/select-files');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const group = page.getByRole('treeitem', { name: '/data/ (File group)', exact: true });
    await expect(group).toBeVisible();
    await expect(page.getByText('File groups organize individually backed-up files.', { exact: false })).toBeVisible();
    if (version === 'older') {
      await group.press(' ');
      await page.locator('app-select-files sh-select').click();
      await page.locator('li.option').filter({ hasText: '7:' }).click();
      await expect.poll(() => listings.filter((x) => x.Time === older && x.Paths === null).length).toBeGreaterThan(0);
    }
    const count = listings.length;
    await group.press('ArrowRight');
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('treeitem', { name: version === 'older' ? 'old-one.txt' : 'one.txt', exact: true })
    ).toBeVisible();
    await group.press(' ');
    await expect(group).toHaveAttribute('aria-checked', 'true');
    let expected = version === 'older' ? oldFiles : files;
    if (version === 'latest') {
      await page.getByRole('treeitem', { name: 'one.txt', exact: true }).press(' ');
      await expect(group).toHaveAttribute('aria-checked', 'mixed');
      expected = files.slice(1);
    }
    expect(listings).toHaveLength(count);
    await page.getByRole('treeitem', { name: '/saved/', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Restore options', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect
      .poll(() => restore)
      .toEqual(
        expect.objectContaining({
          time: version === 'older' ? older : latest,
          paths: expect.arrayContaining([...expected, '/saved/*']),
        })
      );
    expect(restore!.paths).toHaveLength(expected.length + 1);
    expect(
      restore!.paths.some((path) => path.includes('restore-file-group:') || path === '/data/' || path === '/data/*')
    ).toBe(false);
  });
}
