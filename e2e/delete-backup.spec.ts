import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const job = (operationType: 'Backup' | 'Sync') => ({
  Backup: {
    ID: '42',
    Name: 'Deletion fixture',
    OperationType: operationType,
    TargetURL: 'file:///destination',
    DBPath: '/data/fixture.sqlite',
    Sources: ['/source/'],
    Settings: [],
    Filters: [],
    Metadata: { TargetFilesCount: '3', TargetFilesSize: '1024' },
  },
  Schedule: null,
});

const option = (page: Page, heading: string) =>
  page
    .locator('app-delete-backup section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
    .getByRole('checkbox');

async function openDeletion(page: Page) {
  const deletes: Request[] = [];
  await page.route('**/api/v1/filesystem/validate', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/v1/backup/42*', async (route) => {
    expect(route.request().method()).toBe('DELETE');
    deletes.push(route.request());
    await route.fulfill({ json: {} });
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/delete');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Delete backup: Deletion fixture' })).toBeVisible();
  await expect(option(page, 'Delete local database')).toBeVisible();
  return deletes;
}

const deleteButton = (page: Page) => page.getByRole('button', { name: 'Delete backup', exact: true });

test.describe('Sync job deletion', () => {
  test.use({ initialBackups: [[job('Sync')], { scope: 'test' }] });

  test('omits remote deletion while keeping local database deletion available', async ({ authenticatedPage: page }) => {
    const deletes = await openDeletion(page);
    await expect(page.getByRole('heading', { name: 'Delete remote files', exact: true })).toHaveCount(0);
    await expect(option(page, 'Delete remote files')).toHaveCount(0);
    await option(page, 'Delete local database').check();
    await deleteButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Confirm delete' })).toBeVisible();
    expect(deletes).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Delete backup', exact: true }).click();
    await expect(page).toHaveURL('/');
    expect(deletes).toHaveLength(1);
    const query = new URL(deletes[0].url()).searchParams;
    expect(query.get('delete-local-db')).toBe('true');
    expect(query.has('delete-remote-files')).toBe(false);
  });
});

test.describe('backup deletion', () => {
  test.use({ initialBackups: [[job('Backup')], { scope: 'test' }] });

  for (const button of ['ControlOrMeta', 'middle'] as const) {
    test(`export link opens a separate tab with ${button} and Cancel leaves without deleting`, async ({
      authenticatedPage: page,
    }) => {
      const deletes = await openDeletion(page);
      const exportLink = page.getByRole('link', { name: 'Export configuration', exact: true });
      await expect(exportLink).toHaveAttribute('href', '/backup/42/export');
      await page.context().route('**/backup/42/export', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<title>Export configuration target</title>',
        })
      );
      const newTab = page.context().waitForEvent('page');
      if (button === 'middle') await exportLink.click({ button: 'middle' });
      else await exportLink.click({ modifiers: [button] });
      const popup = await newTab;
      await expect(popup).toHaveURL(/\/backup\/42\/export$/);
      await expect(popup).toHaveTitle('Export configuration target');
      await popup.close();
      await expect(page).toHaveURL('/backup/42/delete');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(deletes).toHaveLength(0);
      const cancel = page.getByRole('link', { name: 'Cancel', exact: true });
      await expect(cancel).toHaveAttribute('href', '/');
      await cancel.focus();
      await cancel.press('Enter');
      await expect(page).toHaveURL('/');
      expect(deletes).toHaveLength(0);
    });
  }

  test('cancels confirmation without deleting and then sends the selected options', async ({
    authenticatedPage: page,
  }) => {
    const deletes = await openDeletion(page);
    const remote = option(page, 'Delete remote files');
    await expect(remote).not.toBeChecked();
    await remote.check();
    await deleteButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(deletes).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(deleteButton(page)).toBeEnabled();
    await expect(remote).toBeChecked();
    expect(deletes).toHaveLength(0);
    await expect(page).toHaveURL('/backup/42/delete');
    await deleteButton(page).click();
    await dialog.getByRole('button', { name: 'Delete backup', exact: true }).click();
    await expect(page).toHaveURL('/');
    expect(deletes).toHaveLength(1);
    const query = new URL(deletes[0].url()).searchParams;
    expect(query.get('delete-local-db')).toBe('false');
    expect(query.get('delete-remote-files')).toBe('true');
  });
});
