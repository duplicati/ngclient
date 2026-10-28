import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const usageSelect = (page: Page) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Usage statistics', exact: true }) })
    .locator('sh-select');

test.beforeEach(async ({ authenticatedPage: page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});

for (const { stored, value, label } of [
  { stored: '', value: 'default', label: 'System default (information)' },
  { stored: 'none', value: 'none', label: 'None / disabled' },
  { stored: 'disabled', value: 'none', label: 'None / disabled' },
  { stored: 'warning', value: 'warning', label: 'Warnings, errors and crashes' },
]) {
  test.describe(`saved reporting level ${JSON.stringify(stored)}`, () => {
    test.use({ initialServerSettings: { 'usage-reporter-level': stored } });
    test('shows the saved selection without automatically rewriting it', async ({
      authenticatedPage: page,
      serverApi,
    }) => {
      const select = usageSelect(page);
      await expect(select.locator('input')).toHaveValue(value);
      await expect(select.locator('.selected-value')).toContainText(label);
      await expect(select.locator('sh-spinner')).toHaveCount(0);
      expect(serverApi.settingsRequests).toHaveLength(0);
    });
  });
}

test.describe('saving reporting levels', () => {
  test.use({ initialServerSettings: { 'usage-reporter-level': 'warning' } });

  for (const { label, value, stored } of [
    { label: 'None / disabled', value: 'none', stored: 'none' },
    { label: 'System default (information)', value: 'default', stored: '' },
  ]) {
    test(`saves ${value} using the canonical server value`, async ({ authenticatedPage: page, serverApi }) => {
      const select = usageSelect(page);
      await expect(select.locator('input')).toHaveValue('warning');
      await select.locator('sh-form-field').click();
      await page.getByRole('option', { name: label, exact: true }).click();
      await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
      const request = serverApi.settingsRequests[0].request();
      expect(request.postDataJSON()).toEqual({ 'usage-reporter-level': stored });
      expect(request.headers()['authorization']).toBe('Bearer fixture-access-token');
      await expect(select.locator('input')).toHaveValue(value);
      await expect(select.locator('.selected-value')).toContainText(label);

      const response = page.waitForResponse((response) => response.request() === request);
      await serverApi.settingsRequests[0].fulfill({ status: 200, json: {} });
      expect((await response).status()).toBe(200);
      await expect(select.locator('input')).toHaveValue(value);
      expect(serverApi.settingsRequests).toHaveLength(1);
    });
  }
});
