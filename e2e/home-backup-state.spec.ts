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
