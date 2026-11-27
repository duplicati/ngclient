import { expect, test } from './fixtures/authenticated';

test.use({ initialServerSettings: { 'startup-delay': '5m' } });

test('loads the startup delay, rolls back a rejected edit, and can turn the delay off', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const section = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Pause after startup or hibernation' }) });
  const range = section.getByRole('slider');
  await expect(range).toHaveValue('5');
  await expect(section.locator('sh-select input')).toHaveValue('m');
  expect(serverApi.settingsRequests).toHaveLength(0);
  await range.press('ArrowRight');
  await range.press('ArrowRight');
  await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
  expect(serverApi.settingsRequests[0].request().postDataJSON()).toEqual({ 'startup-delay': '7m' });
  await serverApi.settingsRequests[0].fulfill({ status: 500, json: { Error: 'Rejected by test' } });
  await expect(range).toHaveValue('5');

  await section.locator('sh-select').click();
  await page.getByRole('option', { name: 'None', exact: true }).click();
  await expect(range).toBeDisabled();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(2);
  expect(serverApi.settingsRequests[1].request().postDataJSON()).toEqual({ 'startup-delay': '' });
  await serverApi.settingsRequests[1].fulfill({ status: 200, json: {} });
  await expect(section.locator('sh-select input')).toHaveValue('none');
});
