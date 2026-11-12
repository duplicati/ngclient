import { expect, test } from './fixtures/authenticated';

// Use the real router and generated client against isolated mock responses.
test('retains editor state within a job and loads the correct job on reused routes and history navigation', async ({
  authenticatedPage: page,
}) => {
  const loads: string[] = [];
  const writes: string[] = [];
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/backup/*', (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split('/').at(-1)!;
    if (request.method() !== 'GET') {
      writes.push(request.method());
      return route.fulfill({ status: 500, json: { Error: 'Unexpected write' } });
    }
    loads.push(id);
    return route.fulfill({
      json: {
        Backup: {
          ID: id,
          Name: `Backup ${id}`,
          Description: '',
          Sources: ['/source/'],
          Settings: [{ Name: '--no-encryption', Value: 'True' }],
          TargetURL: 'file:///archive',
          Filters: [],
          Metadata: {},
          OperationType: 'Backup',
        },
        Schedule: null,
      },
    });
  });
  const navigate = (path: string) =>
    page.evaluate((path) => {
      history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);

  await navigate('/backup/42/general');
  const name = page.getByPlaceholder('Your backup name');
  await expect(name).toHaveValue('Backup 42');
  const editor = await page.locator('app-backup').elementHandle();
  await name.fill('Unsaved edit for 42');
  const steps = page.locator('app-backup .backup-stepper');
  await steps.getByRole('link', { name: 'Destination', exact: true }).click();
  await expect(page).toHaveURL('/backup/42/destination');
  await steps.getByRole('link', { name: 'General', exact: true }).click();
  await expect(name).toHaveValue('Unsaved edit for 42');
  await navigate('/backup/42/general?id=ignored#details');
  await expect(page).toHaveURL('/backup/42/general?id=ignored#details');
  await expect(name).toHaveValue('Unsaved edit for 42');
  expect(loads).toEqual(['42']);

  await navigate('/backup/43/general');
  await expect(name).toHaveValue('Backup 43');
  expect(await editor!.evaluate((element) => element.isConnected)).toBe(true);
  expect(loads).toEqual(['42', '43']);
  await page.goBack();
  await expect(page).toHaveURL('/backup/42/general?id=ignored#details');
  await expect(name).toHaveValue('Backup 42');
  await page.goForward();
  await expect(page).toHaveURL('/backup/43/general');
  await expect(name).toHaveValue('Backup 43');
  expect(await editor!.evaluate((element) => element.isConnected)).toBe(true);
  expect(loads).toEqual(['42', '43', '42', '43']);
  expect(writes).toEqual([]);
});
