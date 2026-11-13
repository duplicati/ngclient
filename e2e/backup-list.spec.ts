import { expect, test } from './fixtures/authenticated';

const backup = (id: string, name: string) => ({
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
    Metadata: { BackupListCount: '2' },
    IsTemporary: false,
    IsUnencryptedOrPassphraseStored: true,
    AdditionalTargetURLs: [],
  },
  Schedule: null,
});

test('shows the empty backup list without rendering backup rows', async ({ authenticatedPage: page }) => {
  await expect(page.getByText('No backups found', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Click to create one now' })).toBeVisible();
  await expect(page.locator('.backups .backup')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
});

test.describe('populated backup list', () => {
  // Array-valued options need an outer fixture tuple in Playwright.
  test.use({ initialBackups: [[backup('1', 'Documents'), backup('2', 'Photos')], { scope: 'test' }] });

  test('switches between list and details without losing backup data', async ({ authenticatedPage: page }) => {
    const rows = page.locator('.backups .backup');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Documents');
    await expect(rows.nth(1)).toContainText('Photos');
    await expect(rows.nth(0)).toContainText('2 Versions');

    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const table = page.locator('sh-table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('row').filter({ hasText: 'Documents' })).toHaveCount(1);
    await expect(table.getByRole('row').filter({ hasText: 'Photos' })).toHaveCount(1);
    await expect(table.getByRole('columnheader', { name: 'Backup', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Version', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Documents');
    await expect(rows.nth(1)).toContainText('Photos');
    await expect(table).toHaveCount(0);
  });

  test('applies backup additions, edits, and removals from WebSocket notifications', async ({
    authenticatedPage: page,
    serverApi,
  }) => {
    await expect.poll(() => serverApi.subscriptions.includes('backuplist')).toBe(true);
    const rows = page.locator('.backups .backup');
    await expect(rows).toHaveCount(2);

    serverApi.sendBackupList([backup('1', 'Documents renamed'), backup('2', 'Photos'), backup('3', 'Music')]);
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Documents renamed', exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Music', exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Documents / })).toHaveCount(1);

    serverApi.sendBackupList([backup('3', 'Music')]);
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('Music');
    await expect(page.getByRole('heading', { name: /Documents|Photos/ })).toHaveCount(0);

    serverApi.sendBackupList([]);
    await expect(rows).toHaveCount(0);
    await expect(page.getByText('No backups found', { exact: false })).toBeVisible();
  });
});

test.describe('stable backup row identity', () => {
  const jobs = [backup('1', 'Documents'), backup('2', 'Photos'), backup('3', 'Music'), backup('4', 'Projects')];
  test.use({ initialBackups: [jobs, { scope: 'test' }] });
  for (const view of ['list', 'details', 'restore'] as const) {
    test(`keeps job identity and focus on insertion and removal in ${view}`, async ({
      authenticatedPage: page,
      serverApi,
    }) => {
      if (view === 'details') await page.getByRole('button', { name: 'Details', exact: true }).click();
      if (view === 'restore') {
        await page.getByRole('link', { name: 'Restore', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Where do you want to restore from?' })).toBeVisible();
      }
      const rows =
        view === 'list'
          ? page.locator('.backups .backup')
          : view === 'details'
            ? page.locator('sh-table tbody tr')
            : page.locator('app-restore sh-card');
      const row = rows.filter({ hasText: 'Photos' });
      await expect(row).toHaveCount(1);
      await row.evaluate((node) => node.setAttribute('data-track-probe', 'photos'));
      const action = view === 'restore' ? row : row.getByRole('button', { name: 'Start', exact: true });
      await action.focus();
      await expect(action).toBeFocused();
      const added = backup('0', 'Archive');
      serverApi.sendBackupList([added, ...jobs]);
      await expect(rows.filter({ hasText: 'Archive' })).toHaveCount(1);
      await expect(action).toBeFocused();
      await expect(row).toHaveAttribute('data-track-probe', 'photos');
      // Reordering must retain the job DOM, even when the browser blurs a moved node.
      serverApi.sendBackupList([jobs[2], jobs[0], jobs[1], jobs[3], added]);
      await expect(rows.nth(0)).toContainText('Music');
      await expect(row).toHaveAttribute('data-track-probe', 'photos');
      // Focus restoration across DOM moves is a separate concern from keyed row identity.
      await action.focus();
      await expect(action).toBeFocused();
      serverApi.sendBackupList([jobs[0], jobs[1], jobs[3], added]);
      await expect(rows.filter({ hasText: 'Music' })).toHaveCount(0);
      await expect(action).toBeFocused();
      await expect(row).toHaveAttribute('data-track-probe', 'photos');
      // Renaming a job and replacing all DTOs must keep identity by ID, not name or object reference.
      serverApi.sendBackupList([jobs[0], backup('2', 'Photos renamed'), jobs[3], added]);
      await expect(row).toContainText('Photos renamed');
      await expect(action).toBeFocused();
      await expect(row).toHaveAttribute('data-track-probe', 'photos');
      const search = page.getByPlaceholder('Search backups...', { exact: true });
      await search.fill('Photos');
      await expect(rows.filter({ hasText: 'Documents' })).toHaveCount(0);
      await expect(row).toHaveAttribute('data-track-probe', 'photos');
      await expect(search).toBeFocused();
      await search.fill('');
      await expect(rows.filter({ hasText: 'Documents' })).toHaveCount(1);
      await expect(row).toHaveAttribute('data-track-probe', 'photos');
      await expect(search).toBeFocused();
    });
  }
});
