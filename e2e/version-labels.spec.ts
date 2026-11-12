import type { Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

test.use({
  initialBackups: [
    [
      {
        Backup: {
          ID: '42',
          Name: 'Documents',
          OperationType: 'Backup',
          TargetURL: 'file:///archive',
          Sources: ['/source'],
          Settings: [],
          Metadata: { BackupListCount: '2' },
          DBPathExists: true,
        },
        Schedule: null,
      },
    ],
    { scope: 'test' },
  ],
});

test('label inputs save the correct versions sequentially and lock while saving', async ({
  authenticatedPage: page,
}) => {
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Documents',
          OperationType: 'Backup',
          TargetURL: 'file:///archive',
          Sources: ['/source'],
          Settings: [],
          Metadata: { BackupListCount: '2' },
          DBPathExists: true,
        },
        Schedule: null,
      },
    })
  );
  await page.route('**/api/v2/backup/list-filesets', (route) =>
    route.fulfill({
      json: {
        Success: true,
        Data: [
          { Version: 3, Time: '2026-10-01T00:00:00Z', Label: 'Old', FileCount: 1, FileSizes: 10 },
          { Version: 0, Time: '2026-10-20T00:00:00Z', Label: null, FileCount: 2, FileSizes: 20 },
        ],
      },
    })
  );
  const saves: Route[] = [];
  await page.route('**/api/v2/backup/set-version-label', (route) => {
    saves.push(route);
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/version-labels');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Set version labels for Documents', exact: true })).toBeVisible();
  const labels = page.locator('input.label');
  await expect(labels).toHaveCount(2);
  await expect(labels.nth(0)).toHaveValue('');
  await expect(labels.nth(1)).toHaveValue('Old');
  await labels.nth(0).fill('  Milestone  ');
  await labels.nth(1).fill(' ');
  await page.getByRole('button', { name: /Save 2 labels/ }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].request().postDataJSON()).toEqual({ BackupId: '42', Version: 0, Label: 'Milestone' });
  await expect(labels.nth(0)).toBeDisabled();
  await expect(labels.nth(1)).toBeDisabled();
  await saves[0].fulfill({ json: { Success: true } });
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].request().postDataJSON()).toEqual({ BackupId: '42', Version: 3, Label: null });
  await saves[1].fulfill({ json: { Success: true } });
  await expect(page).toHaveURL('/');
});
