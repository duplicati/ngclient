import { expect, test } from './fixtures/authenticated';

const backup = (id: string, name: string, versions = '2') => ({
  Backup: {
    ID: id,
    Name: name,
    ExternalID: null,
    Description: '',
    Tags: [],
    TargetURL: 'file:///backups',
    DBPath: '/data/backup.sqlite',
    DBPathExists: true,
    Sources: ['/source'],
    Settings: [],
    Filters: [],
    Metadata: { BackupListCount: versions },
    IsTemporary: false,
    IsUnencryptedOrPassphraseStored: true,
    AdditionalTargetURLs: [],
  },
  Schedule: null,
});

test.describe('home backup state', () => {
  test.use({
    initialBackups: [[backup('1', 'Documents'), backup('2', 'Photos'), backup('3', 'Music', '0')], { scope: 'test' }],
  });

  test('keeps the page heading separate from backup actions', async ({ authenticatedPage: page }) => {
    await expect(page.getByRole('button', { name: 'Start all', exact: true })).toBeVisible();
    const heading = page.getByRole('heading', { name: 'My backups', exact: true });
    await expect(heading).toBeVisible();
    await expect(heading.getByRole('button')).toHaveCount(0);
  });

  test('marks queued backups in both views', async ({ authenticatedPage: page, serverApi }) => {
    serverApi.sendServerStatus({ SchedulerQueueIds: [{ Item1: 11, Item2: '2' }] });

    const photos = page.locator('.backups .backup').filter({ hasText: 'Photos' });
    await expect(photos).toContainText(/Next scheduled run:\s*Queued/);

    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const table = page.locator('sh-table');
    await expect(table.getByRole('row').filter({ hasText: 'Photos' })).toContainText('Queued');
    await expect(table.getByRole('row').filter({ hasText: 'Documents' })).not.toContainText('Queued');
  });

  test('highlights the running backup with progress and icon-only controls in details', async ({
    authenticatedPage: page,
    serverApi,
  }) => {
    await page.route('**/api/v1/progressstate', (route) =>
      route.fulfill({
        json: {
          TaskID: 7,
          BackupID: '1',
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
    await page.route('**/api/v1/task/7', (route) => route.fulfill({ json: { ID: 7, Status: 'Running' } }));

    await page.getByRole('button', { name: 'Details', exact: true }).click();
    serverApi.sendServerStatus({
      ActiveTask: { Item1: 7, Item2: '1' },
      SchedulerQueueIds: [
        { Item1: 7, Item2: '1' },
        { Item1: 8, Item2: '2' },
      ],
    });

    const table = page.locator('sh-table');
    const running = table.getByRole('row').filter({ hasText: 'Documents' });
    await expect(running).toHaveClass(/running/);
    await expect(running.locator('.row-progress')).toContainText('42%');
    await expect(running).not.toContainText('Queued');
    await expect(running.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await expect(running.locator('button', { has: page.locator('sh-icon', { hasText: 'stop' }) })).toBeVisible();
    await expect(table.getByRole('row').filter({ hasText: 'Photos' })).toContainText('Queued');

    await page.screenshot({ path: 'test-results/home-running-details.png' });
  });

  test('opens restore from the versions chip in list view', async ({ authenticatedPage: page }) => {
    // Only the navigation matters here; keep the restore page's own loading quiet.
    await page.route('**/api/v1/backup/1', (route) => route.fulfill({ json: backup('1', 'Documents') }));
    await page.route('**/api/v1/backup/1/filesets', (route) => route.fulfill({ json: [] }));

    const music = page.locator('.backups .backup').filter({ hasText: 'Music' });
    await expect(music.getByRole('link')).toHaveCount(0);
    await expect(music).toContainText('No version yet');

    const documents = page.locator('.backups .backup').filter({ hasText: 'Documents' });
    await documents.getByRole('link', { name: /2 Versions/ }).click();
    await expect(page).toHaveURL(/\/restore\/1(\/|$)/);
  });
});

test.describe('home last run failure', () => {
  const withMetadata = (id: string, name: string, metadata: Record<string, string>) => {
    const item = backup(id, name);
    item.Backup.Metadata = { ...item.Backup.Metadata, ...metadata };
    return item;
  };

  test.use({
    initialBackups: [
      [
        withMetadata('1', 'Documents', {
          LastBackupFinished: '20260921T100000Z',
          LastErrorDate: '20260921T110000Z',
          LastErrorMessage: 'The destination is unreachable',
        }),
        withMetadata('2', 'Photos', {
          LastBackupFinished: '20260921T120000Z',
          LastErrorDate: '20260921T110000Z',
          LastErrorMessage: 'An older failure',
        }),
      ],
      { scope: 'test' },
    ],
  });

  test('marks only the backup whose latest run failed in both views', async ({ authenticatedPage: page }) => {
    const documents = page.locator('.backups .backup').filter({ hasText: 'Documents' });
    const photos = page.locator('.backups .backup').filter({ hasText: 'Photos' });
    await expect(documents.locator('sh-chip.error')).toHaveText(/Last run failed/);
    await expect(photos).toBeVisible();
    await expect(photos.locator('sh-chip.error')).toHaveCount(0);

    await documents.locator('sh-chip.error').hover();
    await expect(page.getByText('The destination is unreachable')).toBeVisible();

    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const table = page.locator('sh-table');
    await expect(table.getByRole('row').filter({ hasText: 'Documents' }).locator('sh-chip.error')).toHaveText(/Failed/);
    await expect(table.getByRole('row').filter({ hasText: 'Photos' }).locator('sh-chip.error')).toHaveCount(0);
  });
});
