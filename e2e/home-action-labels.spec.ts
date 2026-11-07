import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const backup = (id: string, name: string, external = false) => ({
  Backup: {
    ID: id,
    Name: name,
    OperationType: 'Backup',
    ExternalID: external ? 'external-job' : null,
    Description: '',
    Tags: [],
    TargetURL: 'file:///backups',
    DBPath: '/data/backup.sqlite',
    DBPathExists: true,
    Sources: ['/source/'],
    Settings: [],
    Filters: [],
    Metadata: { BackupListCount: '1' },
    IsTemporary: false,
    IsUnencryptedOrPassphraseStored: true,
    AdditionalTargetURLs: [],
  },
  Schedule: null,
});
test.use({ initialBackups: [[backup('42', 'Documents'), backup('43', 'Managed', true)], { scope: 'test' }] });
function iconButton(page: Page, row: Locator, icon: string) {
  return row.locator('button').filter({ has: page.locator('sh-icon', { hasText: icon }) });
}
async function tooltip(page: Page, button: Locator, text: string) {
  await button.hover();
  await expect(page.getByRole('tooltip')).toHaveText(text);
  await page.getByRole('heading', { name: 'My backups', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
}

for (const view of ['list', 'details'] as const) {
  test(`names and explains edit and more actions in ${view} view`, async ({ authenticatedPage: page }) => {
    if (view === 'details') await page.getByRole('button', { name: 'Details', exact: true }).click();
    const rows = view === 'list' ? page.locator('.backups .backup') : page.locator('sh-table').getByRole('row');
    const row = rows.filter({ hasText: 'Documents' });
    const edit = iconButton(page, row, 'pencil-simple');
    await expect(edit).toHaveAccessibleName('Edit');
    await tooltip(page, edit, 'Edit');
    const more = iconButton(page, row, 'dots-three-vertical');
    await expect(more).toHaveAccessibleName('More actions');
    await tooltip(page, more, 'More actions');
    if (view === 'details') {
      const start = iconButton(page, row, 'play-circle');
      await expect(start).toHaveAccessibleName('Start');
      await tooltip(page, start, 'Start');
    }
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  });
}

test('names the disabled edit button for externally managed jobs', async ({ authenticatedPage: page }) => {
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const row = page.locator('sh-table').getByRole('row').filter({ hasText: 'Managed' });
  const edit = iconButton(page, row, 'pencil-simple');
  await expect(edit).toBeDisabled();
  await expect(edit).toHaveAccessibleName('Externally managed');
  await tooltip(page, edit.locator('..'), 'Externally managed');
});

test('keeps names aligned with stop, abort, pause and resume in details view', async ({
  authenticatedPage: page,
  serverApi,
}) => {
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
  await page.route('**/api/v1/task/73/stop', (route) => route.fulfill({ json: {} }));
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  serverApi.sendServerStatus({ ActiveTask: { Item1: 73, Item2: '42' } });
  const row = page.locator('sh-table').getByRole('row').filter({ hasText: 'Documents' });
  const stop = iconButton(page, row, 'stop');
  await expect(stop).toBeVisible();
  await expect(stop).toHaveAccessibleName('Stop');
  await tooltip(page, stop, 'Stop');
  const pause = row.getByRole('button', { name: 'Pause', exact: true });
  await expect(pause).toBeVisible();
  await tooltip(page, pause, 'Pause');
  serverApi.sendServerStatus({ ProgramState: 'Paused' });
  const resume = row.getByRole('button', { name: 'Resume', exact: true });
  await expect(resume).toBeVisible();
  await tooltip(page, resume, 'Resume');
  await row.getByRole('button', { name: 'Stop', exact: true }).click();
  const abort = row.getByRole('button', { name: 'Abort', exact: true });
  await expect(abort).toBeVisible();
  await tooltip(page, abort, 'Abort');
});
