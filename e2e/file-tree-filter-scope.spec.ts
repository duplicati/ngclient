import { expect, test } from './fixtures/authenticated';

test('include filters do not highlight folders outside the selected source', async ({ authenticatedPage: page }) => {
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Filter scope',
          Description: '',
          Sources: ['/selected/'],
          Settings: [{ Name: '--no-encryption', Value: 'True' }],
          TargetURL: 'file:///backup',
          Filters: [{ Order: 0, Include: true, Expression: '*/b*' }],
          Metadata: {},
          OperationType: 'Backup',
        },
        Schedule: null,
      },
    })
  );
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/filesystem*', (route) => {
    const path = route.request().postDataJSON().path;
    const items =
      path === '/selected/'
        ? [{ id: '/selected/b-one/', text: 'b-one', cls: 'folder', leaf: false }]
        : path === '/outside/'
          ? [{ id: '/outside/b-two/', text: 'b-two', cls: 'folder', leaf: false }]
          : [
              { id: '/selected/', text: 'selected', cls: 'folder', leaf: false },
              { id: '/outside/', text: 'outside', cls: 'folder', leaf: false },
            ];
    return route.fulfill({ json: items });
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/source-data');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const row = (name: string) =>
    page.locator('.browse-files [action]').filter({ has: page.locator('.text span', { hasText: name }) });
  await expect(row('b-one')).toBeVisible();
  await expect(row('b-one')).toHaveClass(/active/);
  await row('outside').locator('.icon').first().click();
  await expect(row('b-two')).toBeVisible();
  await expect(row('b-two')).not.toHaveClass(/active|excluded/);
  await expect(row('b-one')).toHaveClass(/active/);
});
