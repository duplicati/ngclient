import type { Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

test('command fields preserve edited arguments, failure retry and saved URL state', async ({
  authenticatedPage: page,
}) => {
  const runs: Route[] = [];
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/commandline', (route) => {
    if (route.request().method() === 'POST') {
      runs.push(route);
      return;
    }
    return route.fulfill({ json: ['backup', 'test'] });
  });
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Command fields',
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
  await editor.locator('sh-select').click();
  await page.locator('li.option').getByText('test', { exact: true }).click();
  await expect(editor.locator('#arguments')).toHaveValue('');
  await editor.locator('#arguments').fill('4');
  await editor.locator('#targetUrl').fill('file:///folder with spaces');
  await editor.locator('#backup-name').fill('Edited name');
  await editor.getByRole('button', { name: 'Run "test" command now', exact: true }).click();
  await expect.poll(() => runs.length).toBe(1);
  expect(runs[0].request().postDataJSON().slice(0, 4)).toEqual([
    'test',
    'file:///folder with spaces',
    '4',
    '--backup-name=Edited name',
  ]);
  await runs[0].fulfill({ status: 500, json: { Error: 'Fixture command failure' } });
  await expect(editor.getByRole('button', { name: 'Run "test" command now', exact: true })).not.toHaveClass(/loading/);
  await editor.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goBack();
  await expect(editor.locator('#arguments')).toHaveValue('4');
  await expect(editor.locator('#targetUrl')).toHaveValue('file:///folder with spaces');
  await expect(editor.locator('#backup-name')).toHaveValue('Edited name');
  expect(runs).toHaveLength(1);
});
