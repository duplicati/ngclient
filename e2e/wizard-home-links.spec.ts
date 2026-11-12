import { expect, test } from './fixtures/authenticated';

for (const scenario of [
  { path: '/restore/from-config', component: 'app-restore-from-config', label: 'Back' },
  { path: '/backup/42/purge-files/select-files', component: 'app-purge-select-files', label: 'Exit' },
]) {
  test(`${scenario.label} opens home without starting a wizard operation`, async ({ authenticatedPage: page }) => {
    const writes: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (
        request.method() === 'DELETE' ||
        (request.method() === 'POST' && /\/(backups(?:\/import)?|backup\/purge-files)$/.test(path))
      ) {
        writes.push(request.method() + ' ' + path);
      }
    });
    await page.route('**/api/v1/backup/42', (route) =>
      route.fulfill({ json: { Backup: { ID: '42', OperationType: 'Backup' } } })
    );
    await page.route('**/api/v2/backup/list-filesets', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
    await page.evaluate((path) => {
      history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, scenario.path);
    const home = page.locator(scenario.component).getByRole('link', { name: scenario.label, exact: true });
    await expect(home).toHaveAttribute('href', '/');
    await page.context().route(new URL(page.url()).origin + '/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Home navigation target</title>',
      })
    );
    const newTab = page.context().waitForEvent('page');
    await home.click({ modifiers: ['ControlOrMeta'] });
    const popup = await newTab;
    await expect(popup).toHaveURL(new URL(page.url()).origin + '/');
    await expect(popup).toHaveTitle('Home navigation target');
    await popup.close();
    await expect(page).toHaveURL(scenario.path);
    expect(writes).toEqual([]);
    await home.focus();
    await home.press('Enter');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  });
}
