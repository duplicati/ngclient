import { type Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const OUTPUT = [
  'Listing changes',
  '  1: 11/2/2026 10:00:01 AM',
  '  0: 11/3/2026 10:00:01 AM',
  '',
  'Size of backup 1: 1.95 KiB',
  '',
  '  2 added entries:',
  '  + /home/user/new/',
  '  + /home/user/new/notes.txt',
  '',
  '  1 modified entries:',
  '  ~ /home/user/report.docx',
  '',
  '1 deleted entries:',
  '  - /home/user/old.txt',
  '',
  '',
  '  Added folders:     1',
  '  Added files:       1',
  '  Deleted files:     1',
  '  Modified files:    1',
  'Size of backup 0: 2.10 KiB',
];

async function openCompare(page: Page, query = '') {
  const commands: string[][] = [];
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Documents',
          TargetURL: 'file:///backups/documents',
          DBPath: '/data/documents.sqlite',
          Settings: [{ Name: '--no-encryption', Value: 'true' }],
        },
      },
    })
  );
  await page.route('**/api/v1/backup/42/filesets', (route) =>
    route.fulfill({
      json: [
        { Version: 0, Time: '2026-11-03T10:00:01Z' },
        { Version: 1, Time: '2026-11-02T10:00:01Z', Label: 'Before upgrade' },
        { Version: 2, Time: '2026-11-01T10:00:00Z' },
      ],
    })
  );
  await page.route('**/api/v1/commandline', (route) => {
    commands.push(route.request().postDataJSON());
    return route.fulfill({ json: { Status: 'OK', ID: 'run-compare' } });
  });
  await page.route('**/api/v1/commandline/run-compare?*', (route) =>
    route.fulfill({
      json: { Started: true, Finished: true, Count: OUTPUT.length, Offset: 0, Pagesize: 1000, Items: OUTPUT },
    })
  );
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/backup/42/compare${query}`);
  const component = page.locator('app-compare-versions');
  await expect(component.getByRole('heading', { name: 'Compare versions of Documents' })).toBeVisible();
  return { component, commands };
}

test('the two newest versions are compared when Compare is pressed', async ({ authenticatedPage: page }) => {
  const { component, commands } = await openCompare(page);
  await expect(component.locator('.comparison')).toHaveCount(0);
  expect(commands).toHaveLength(0);

  await component.getByRole('button', { name: 'Compare', exact: true }).click();

  await expect(component.locator('.change .path')).toHaveText([
    '/home/user/new/',
    '/home/user/new/notes.txt',
    '/home/user/report.docx',
    '/home/user/old.txt',
  ]);
  expect(commands).toHaveLength(1);
  expect(commands[0].slice(0, 4)).toEqual(['compare', 'file:///backups/documents', '1', '0']);
  expect(commands[0]).toContain('--full-result');
  await expect(component.locator('.summary-card.added .count')).toHaveText('2');
  await expect(component.locator('.summary-card.modified .count')).toHaveText('1');
  await expect(component.locator('.summary-card.deleted .count')).toHaveText('1');
  await expect(page).toHaveURL('/backup/42/compare?base=1&target=0');

  await component.getByRole('textbox', { name: 'Filter by path' }).fill('report');
  await expect(component.locator('.change .path')).toHaveText(['/home/user/report.docx']);
});

test('the versions of a link are compared right away', async ({ authenticatedPage: page }) => {
  const { component, commands } = await openCompare(page, '?base=2&target=1');

  await expect(component.locator('.change')).toHaveCount(4);
  expect(commands).toHaveLength(1);
  expect(commands[0].slice(0, 4)).toEqual(['compare', 'file:///backups/documents', '2', '1']);
  await expect(component.locator('.comparison h4')).toContainText('Version 2');
  await expect(component.locator('.comparison h4')).toContainText('to version 1');
});
