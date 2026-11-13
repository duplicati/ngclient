import { expect, test } from './fixtures/authenticated';

const backup = (ID: string, Name: string) => ({
  Backup: {
    ID,
    Name,
    ExternalID: null,
    OperationType: 'Backup',
    Description: '',
    Tags: [],
    TargetURL: 'file:///backups',
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
const backups = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((name, index) => backup(String(index + 1), name));

test.describe('home backup search', () => {
  test.use({ initialBackups: [backups, { scope: 'test' }] });
  for (const view of ['list', 'details'] as const) {
    test(`filters and clears the backup search in ${view} view`, async ({ authenticatedPage: page }) => {
      if (view === 'details') await page.getByRole('button', { name: 'Details', exact: true }).click();
      const rows = view === 'list' ? page.locator('.backups .backup') : page.locator('sh-table').getByRole('row');
      const search = page.getByPlaceholder('Search backups...', { exact: true });
      await expect(search).toBeVisible();
      await search.fill('  aLpHa  ');
      await expect(rows.filter({ hasText: 'Alpha' })).toHaveCount(1);
      await expect(rows.filter({ hasText: 'Beta' })).toHaveCount(0);
      await search.fill('nothing matches');
      await expect(rows.filter({ hasText: 'Alpha' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Clear search', exact: true }).press('Enter');
      await expect(search).toHaveValue('');
      for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta'])
        await expect(rows.filter({ hasText: name })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(0);
    });
  }
});

test.describe('small backup list', () => {
  test.use({ initialBackups: [backups.slice(0, 3), { scope: 'test' }] });
  test('keeps the search hidden for three backups', async ({ authenticatedPage: page }) => {
    await expect(page.getByPlaceholder('Search backups...', { exact: true })).toHaveCount(0);
    await expect(page.locator('.backups .backup')).toHaveCount(3);
  });
});
