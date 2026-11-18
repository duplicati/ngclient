import { expect, test } from './fixtures/authenticated';

test('Show Update opens available notes and ordinary changelog navigation restores installed notes', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const queries: boolean[] = [];
  await page.route('**/api/v1/changelog*', (route) => {
    const update = new URL(route.request().url()).searchParams.get('from-update') === 'true';
    queries.push(update);
    return route.fulfill({ json: { Changelog: update ? '# Available update notes' : '# Installed version notes' } });
  });
  serverApi.sendNotifications([
    { ID: 17, Type: 'Information', Title: 'Update ready', Message: 'A new version is available', Action: 'update:new' },
  ]);
  await page.locator('app-service-hub > button').nth(1).click();
  await page.locator('.alert-stream-modal').getByRole('button', { name: 'Show Update', exact: true }).click();
  await expect(page).toHaveURL('/about/changelog?from-update=true');
  if (await page.locator('.alert-stream-modal').isVisible())
    await page.locator('app-service-hub > button').nth(1).click();
  await expect(page.getByRole('heading', { name: /^Available update notes/ })).toBeVisible();
  await page.screenshot({ path: 'tmp/eight-prs-20261118/changelog.png' });
  await page.getByRole('tab', { name: 'Changelog', exact: true }).click();
  await expect(page).toHaveURL('/about/changelog');
  await expect(page.getByRole('heading', { name: /^Installed version notes/ })).toBeVisible();
  expect(queries).toEqual([true, false]);
});
