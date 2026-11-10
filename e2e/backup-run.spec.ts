import { type Locator, type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const backup = (id: string, name: string, versions = '1') => ({
  Backup: {
    ID: id,
    Name: name,
    OperationType: 'Backup',
    ExternalID: null,
    Description: '',
    Tags: [],
    TargetURL: 'file:///backups',
    DBPath: '/data/backup.sqlite',
    DBPathExists: true,
    Sources: ['/source/'],
    Settings: [],
    Filters: [],
    Metadata: { BackupListCount: versions },
    IsTemporary: false,
    IsUnencryptedOrPassphraseStored: true,
    AdditionalTargetURLs: [],
  },
  Schedule: null,
});
const documents = backup('42', 'Documents');
const photos = backup('43', 'Photos');
test.use({ initialBackups: [[documents, photos], { scope: 'test' }] });

function action(page: Page, row: Locator, icon: string) {
  return row.locator('button').filter({ has: page.locator('sh-icon', { hasText: icon }) });
}
async function installOperations(page: Page) {
  const starts: Route[] = [];
  const stops: Route[] = [];
  await page.route('**/api/v1/backup/*/start', (route) => {
    starts.push(route);
  });
  await page.route('**/api/v1/task/*/stop', (route) => {
    stops.push(route);
  });
  await page.route('**/api/v1/progressstate', (route) =>
    route.fulfill({
      json: {
        TaskID: 73,
        BackupID: '42',
        Phase: 'Backup_ProcessingFiles',
        StillCounting: false,
        TotalFileCount: 10,
        ProcessedFileCount: 4,
        TotalFileSize: 1000,
        ProcessedFileSize: 420,
        CurrentFilecomplete: true,
        CurrentFileoffset: 0,
      },
    })
  );
  await page.route('**/api/v1/task/73', (route) => route.fulfill({ json: { ID: 73, Status: 'Running' } }));
  return { starts, stops };
}

for (const view of ['list', 'details'] as const) {
  test(`starts the chosen backup and follows queue, progress and stop in ${view} view`, async ({
    authenticatedPage: page,
    serverApi,
  }) => {
    const { starts, stops } = await installOperations(page);
    if (view === 'details') await page.getByRole('button', { name: 'Details', exact: true }).click();
    const rows = view === 'list' ? page.locator('.backups .backup') : page.locator('sh-table').getByRole('row');
    const selected = rows.filter({ hasText: 'Documents' });
    const other = rows.filter({ hasText: 'Photos' });
    const start = action(page, selected, 'play-circle');
    await start.click();
    await expect.poll(() => starts.length).toBe(1);
    expect(starts[0].request().method()).toBe('POST');
    expect(new URL(starts[0].request().url()).pathname).toBe('/api/v1/backup/42/start');
    await expect(start).toHaveClass(/loading/);
    await expect(action(page, other, 'play-circle')).not.toHaveClass(/loading/);
    await starts[0].fulfill({ json: { Status: 'OK', ID: 73 } });
    await expect(start).not.toHaveClass(/loading/);

    serverApi.sendServerStatus({ SchedulerQueueIds: [{ Item1: 73, Item2: '42' }] });
    await expect(selected).toContainText('Queued');
    await expect(other).not.toContainText('Queued');
    serverApi.sendServerStatus({
      ActiveTask: { Item1: 73, Item2: '42' },
      SchedulerQueueIds: [{ Item1: 73, Item2: '42' }],
    });
    const stop = action(page, selected, 'stop');
    await expect(stop).toBeVisible();
    await expect(selected).not.toContainText('Queued');
    await expect(action(page, other, 'play-circle')).toBeVisible();
    if (view === 'details') {
      await expect(selected).toHaveClass(/running/);
      await expect(selected.locator('.row-progress')).toContainText('42%');
    } else {
      await expect(selected.locator('app-backup-progress sh-progress-bar')).toBeVisible();
    }
    await stop.click();
    await expect.poll(() => stops.length).toBe(1);
    expect(stops[0].request().method()).toBe('POST');
    expect(new URL(stops[0].request().url()).pathname).toBe('/api/v1/task/73/stop');
    await stops[0].fulfill({ json: { Status: 'OK' } });
    await expect(action(page, selected, 'skull')).toBeVisible();
    expect(starts).toHaveLength(1);

    serverApi.sendServerStatus({ ActiveTask: null, SchedulerQueueIds: [] });
    serverApi.sendBackupList([backup('42', 'Documents', '2'), photos]);
    await expect(action(page, selected, 'play-circle')).toBeVisible();
    await expect(action(page, selected, 'stop')).toHaveCount(0);
    await expect(action(page, selected, 'skull')).toHaveCount(0);
    await expect(selected).not.toContainText('Queued');
    await expect(selected).toContainText(/2\s+Versions/);
    await expect(other).toContainText(/1\s+Version/);
    expect(serverApi.requests.filter((request) => new URL(request.url()).pathname.endsWith('/abort'))).toEqual([]);
  });
}

test('a paused server starts nothing on cancel and waits for resume before starting the chosen backup', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const { starts } = await installOperations(page);
  const resumes: Route[] = [];
  await page.route('**/api/v1/serverstate/resume', (route) => {
    resumes.push(route);
  });
  serverApi.sendServerStatus({ ProgramState: 'Paused' });
  await expect(page.locator('app-status-bar').getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  const selected = page.locator('.backups .backup').filter({ hasText: 'Documents' });
  await action(page, selected, 'play-circle').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Server paused', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: "No, I'll resume later", exact: true }).click();
  expect(starts).toHaveLength(0);
  expect(resumes).toHaveLength(0);

  await action(page, selected, 'play-circle').click();
  await dialog.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(() => resumes.length).toBe(1);
  expect(resumes[0].request().method()).toBe('POST');
  expect(starts).toHaveLength(0);
  serverApi.sendServerStatus({ ProgramState: 'Running' });
  await expect(page.locator('app-status-bar').getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(starts).toHaveLength(0);
  await resumes[0].fulfill({ json: {} });
  await expect.poll(() => starts.length).toBe(1);
  expect(new URL(starts[0].request().url()).pathname).toBe('/api/v1/backup/42/start');
  await starts[0].fulfill({ json: { Status: 'OK', ID: 73 } });
  await expect(action(page, selected, 'play-circle')).not.toHaveClass(/loading/);
});
