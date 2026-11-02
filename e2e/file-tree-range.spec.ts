import { expect, test } from './fixtures/authenticated';

test('Shift-click selects a range without clearing earlier selections', async ({ authenticatedPage: page }) => {
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Range test',
          Description: '',
          Sources: [],
          Settings: [{ Name: '--no-encryption', Value: 'True' }],
          TargetURL: 'file:///backup',
          Filters: [],
          Metadata: {},
          OperationType: 'Backup',
        },
        Schedule: null,
      },
    })
  );
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/filesystem*', (route) =>
    route.fulfill({
      json: ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt'].map((name) => ({
        id: '/' + name,
        text: name,
        cls: 'file',
        leaf: true,
      })),
    })
  );
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/source-data');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const row = (name: string) =>
    page.locator('.browse-files [action]').filter({ has: page.locator('.text span', { hasText: name }) });
  await expect(row('a.txt')).toBeVisible();
  await row('e.txt').locator('.text').click();
  await row('a.txt').locator('.text').click();
  await row('c.txt')
    .locator('.text')
    .click({ modifiers: ['Shift'] });
  for (const name of ['a.txt', 'b.txt', 'c.txt', 'e.txt']) await expect(row(name)).toHaveClass(/active/);
  await expect(row('d.txt')).not.toHaveClass(/active/);
  await row('d.txt')
    .locator('.text')
    .click({ modifiers: ['Shift'] });
  await expect(row('d.txt')).toHaveClass(/active/);
});
