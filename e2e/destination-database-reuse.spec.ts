import { expect, test } from './fixtures/authenticated';

for (const reuse of [true, false]) {
  test(`existing database selection reuse=${reuse} is explicit before moving to Schedule`, async ({
    authenticatedPage: page,
  }) => {
    await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
    await page.route('**/api/v1/backupdefaults', (route) =>
      route.fulfill({
        json: {
          Backup: {
            Name: 'Reuse database',
            Description: '',
            TargetURL: 'file:///backup',
            Sources: ['/source/'],
            Settings: [{ Name: '--no-encryption', Value: 'true' }],
            Filters: [],
            Metadata: {},
            OperationType: 'Backup',
          },
          Schedule: null,
          ApplicationOptions: [],
        },
      })
    );
    await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v1/remoteoperation/test*', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/v1/remoteoperation/dbpath', (route) =>
      route.fulfill({ json: { Exists: true, Path: '/cli/history.sqlite' } })
    );
    const saves: Record<string, any>[] = [];
    await page.route('**/api/v1/backups*', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      expect(new URL(route.request().url()).searchParams.get('existingdb')).toBe(reuse ? 'true' : null);
      saves.push(route.request().postDataJSON());
      return route.fulfill({ json: { ID: '77' } });
    });
    await page.evaluate(() => {
      history.pushState(null, '', '/backup/new/destination');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const dialog = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Use existing database?', exact: true }) });
    await expect(dialog).toBeVisible();
    expect(saves).toEqual([]);
    if (reuse) await page.screenshot({ path: 'tmp/eight-prs-20261118/reuse.png' });
    await dialog
      .getByRole('button', { name: reuse ? 'Use existing database' : 'Create new database', exact: true })
      .click();
    await expect(page).toHaveURL('/backup/new/schedule');
    await page.getByRole('link', { name: 'Options', exact: true }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page).toHaveURL('/');
    expect(saves).toHaveLength(1);
    expect(saves[0]['Backup'].DBPath).toBe(reuse ? '/cli/history.sqlite' : undefined);
  });
}
