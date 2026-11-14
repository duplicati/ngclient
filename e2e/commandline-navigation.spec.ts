import { expect, test } from './fixtures/authenticated';

test('command editor Back supports native home navigation without running the edited command', async ({
  authenticatedPage: page,
}) => {
  const runs: unknown[] = [];
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/commandline', async (route) => {
    if (route.request().method() === 'POST') {
      runs.push(route.request().postDataJSON());
      return route.fulfill({ json: { Status: 'OK', ID: 'unexpected-run' } });
    }
    return route.fulfill({ json: ['backup', 'test'] });
  });
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Command navigation',
          TargetURL: 'file:///archive',
          DBPath: '/db/42.sqlite',
          Sources: ['/source'],
          Settings: [],
          Filters: [],
        },
        Schedule: null,
      },
    })
  );
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/commandline');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const editor = page.locator('app-commandline');
  await expect(editor.locator('#arguments')).toHaveValue('/source');
  await editor.locator('#arguments').fill('/edited/source');
  await editor.locator('#targetUrl').fill('file:///edited/archive');
  const back = editor.getByRole('link', { name: 'Back', exact: true });
  await expect(back).toHaveAttribute('href', '/');
  const home = new URL('/', page.url()).href;
  // New tabs verify the document target; the current tab exercises Angular navigation below.
  await page
    .context()
    .route(home, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Home target</title>' }));
  for (const click of [{ modifiers: ['Control' as const] }, { button: 'middle' as const }]) {
    const opened = page.context().waitForEvent('page');
    await back.click(click);
    const tab = await opened;
    await expect(tab).toHaveURL(home);
    await tab.close();
    await expect(page).toHaveURL('/backup/42/commandline');
    await expect(editor.locator('#arguments')).toHaveValue('/edited/source');
    await expect(editor.locator('#targetUrl')).toHaveValue('file:///edited/archive');
    expect(runs).toEqual([]);
  }
  await back.focus();
  await expect(back).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  expect(runs).toEqual([]);
});
