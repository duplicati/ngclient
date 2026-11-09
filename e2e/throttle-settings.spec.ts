import { expect, test } from './fixtures/authenticated';

test.use({ initialServerSettings: { 'max-upload-speed': '8MB', 'max-download-speed': '2GB' } });

test.beforeEach(async ({ authenticatedPage: page }) => {
  await page
    .locator('.desktop-actions')
    .getByRole('button')
    .filter({ has: page.locator('sh-icon').getByText('speedometer', { exact: true }) })
    .click();
  await expect(page.getByRole('heading', { name: 'Throttle network speed' })).toBeVisible();
});

test('loads limits and lets the user cancel changes without saving', async ({ authenticatedPage: page, serverApi }) => {
  const dialog = page.getByRole('dialog');
  const upload = dialog.locator('.field-row').filter({ hasText: 'Max upload speed' });
  const download = dialog.locator('.field-row').filter({ hasText: 'Max download speed' });
  await expect(upload.getByRole('spinbutton')).toHaveValue('67.11');
  await expect(upload.locator('sh-select input')).toHaveValue('mbps');
  await expect(download.getByRole('spinbutton')).toHaveValue('17.18');
  await expect(download.locator('sh-select input')).toHaveValue('gbps');

  await upload.getByRole('spinbutton').fill('10');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(serverApi.settingsRequests).toHaveLength(0);
});

test('preserves edits after a rejected update and saves them on retry', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const dialog = page.getByRole('dialog');
  const upload = dialog.locator('.field-row').filter({ hasText: 'Max upload speed' }).getByRole('spinbutton');
  const download = dialog.locator('.field-row').filter({ hasText: 'Max download speed' }).getByRole('spinbutton');
  const save = dialog.getByRole('button', { name: 'Update settings', exact: true });
  const payload = { 'max-upload-speed': '2MB', 'max-download-speed': '' };

  await expect(upload).toHaveValue('67.11');
  await upload.fill('16');
  await download.fill('0');
  await save.click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
  expect(serverApi.settingsRequests[0].request().postDataJSON()).toEqual(payload);
  await expect(save).toHaveClass(/\bloading\b/);
  await serverApi.settingsRequests[0].fulfill({ status: 500, json: { Error: 'Rejected by test' } });

  await expect(save).not.toHaveClass(/\bloading\b/);
  await expect(upload).toHaveValue('16');
  await expect(download).toHaveValue('0');
  await save.click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(2);
  expect(serverApi.settingsRequests[1].request().postDataJSON()).toEqual(payload);
  await expect(dialog).toBeVisible();
  await serverApi.settingsRequests[1].fulfill({ status: 200, json: {} });

  await expect(dialog).toHaveCount(0);
  expect(serverApi.settingsRequests).toHaveLength(2);
  expect(serverApi.pageErrors).toEqual([]);
});
