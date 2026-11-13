import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const backup = (ID: string, Name: string, OperationType = 'Backup') => ({
  Backup: {
    ID,
    Name,
    OperationType,
    ExternalID: null,
    Description: '',
    Tags: [],
    TargetURL: 'file:///backup',
    DBPath: '/data/backup.sqlite',
    DBPathExists: true,
    Sources: ['/source'],
    Settings: [],
    Filters: [],
    Metadata: { BackupListCount: '1' },
    IsTemporary: false,
    IsUnencryptedOrPassphraseStored: true,
    AdditionalTargetURLs: [],
  },
  Schedule: null,
});
const backups = ['Documents', 'Photos', 'Music', 'Projects'].map((name, index) => backup(String(index + 1), name));
const sync = backup('sync', 'Hidden sync', 'Sync');
async function openRestore(page: Page) {
  await page.evaluate(() => {
    history.pushState(null, '', '/restore');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Where do you want to restore from?', exact: true })).toBeVisible();
}

test.describe('restore search', () => {
  test.use({ initialBackups: [[...backups, sync], { scope: 'test' }] });
  test('filters eligible jobs and clears the search without hiding direct restore options', async ({
    authenticatedPage: page,
  }) => {
    await openRestore(page);
    const restore = page.locator('app-restore');
    const search = restore.getByPlaceholder('Search backups...', { exact: true });
    await expect(restore.getByRole('heading', { name: 'Hidden sync', exact: true })).toHaveCount(0);
    await search.fill('  pHo  ');
    await expect(restore.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
    await expect(restore.getByRole('heading', { name: 'Documents', exact: true })).toHaveCount(0);
    await search.fill('nothing matches');
    await expect(restore.getByText('No backups match "nothing matches"', { exact: true })).toBeVisible();
    await expect(restore.getByRole('heading', { name: 'Direct restore from backup files', exact: true })).toBeVisible();
    await expect(restore.getByRole('heading', { name: 'Restore from configuration', exact: true })).toBeVisible();
    await restore.getByRole('button', { name: 'Clear search', exact: true }).press('Enter');
    await expect(search).toHaveValue('');
    for (const name of ['Documents', 'Photos', 'Music', 'Projects'])
      await expect(restore.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(restore.getByRole('heading', { name: 'Hidden sync', exact: true })).toHaveCount(0);
  });
});
test.describe('restore search threshold', () => {
  test.use({ initialBackups: [[...backups.slice(0, 3), sync], { scope: 'test' }] });
  test('counts eligible backups rather than an unsupported Sync job', async ({ authenticatedPage: page }) => {
    await openRestore(page);
    const restore = page.locator('app-restore');
    await expect(restore.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
    await expect(restore.getByPlaceholder('Search backups...', { exact: true })).toHaveCount(0);
    await expect(restore.getByRole('heading', { name: 'Hidden sync', exact: true })).toHaveCount(0);
  });
});
