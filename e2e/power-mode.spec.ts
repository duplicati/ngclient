import { expect, test } from './fixtures/authenticated';

test.use({ powerModeProviders: ['', 'None', 'Windows'], initialServerSettings: { 'power-mode-provider': 'Windows' } });

test('loads the power provider and restores it when saving is rejected', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const select = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Power mode provider' }) })
    .locator('sh-select');
  await expect(select.locator('input')).toHaveValue('Windows');
  expect(serverApi.settingsRequests).toHaveLength(0);
  await select.click();
  await page.getByRole('option', { name: 'None', exact: true }).click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
  expect(serverApi.settingsRequests[0].request().postDataJSON()).toEqual({ 'power-mode-provider': 'None' });
  await serverApi.settingsRequests[0].fulfill({ status: 500, json: { Error: 'Rejected by test' } });
  await expect(select.locator('input')).toHaveValue('Windows');

  await select.click();
  await select.getByRole('option', { name: 'Default', exact: true }).click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(2);
  expect(serverApi.settingsRequests[1].request().postDataJSON()).toEqual({ 'power-mode-provider': '' });
  await serverApi.settingsRequests[1].fulfill({ status: 200, json: {} });
  await expect(select.locator('input')).toHaveValue('default');
});
