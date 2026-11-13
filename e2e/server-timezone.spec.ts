import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const timezoneSelect = (page: Page) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Server time zone', exact: true }) })
    .locator('sh-select');

test.beforeEach(async ({ authenticatedPage: page }) => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});

for (const { stored, value, label } of [
  { stored: '', value: 'default', label: 'System default' },
  { stored: 'Europe/Copenhagen', value: 'Europe/Copenhagen', label: '(UTC+01:00) Central European Time' },
  // A bare display name is prefixed with the current offset
  { stored: 'America/New_York', value: 'America/New_York', label: '(UTC-05:00) Eastern Time' },
  // A saved zone the server does not list stays visible under its id
  { stored: 'US/Pacific', value: 'US/Pacific', label: 'US/Pacific' },
]) {
  test.describe(`saved time zone ${JSON.stringify(stored)}`, () => {
    test.use({ initialServerSettings: { 'server-timezone': stored } });
    test('shows the saved selection without automatically rewriting it', async ({
      authenticatedPage: page,
      serverApi,
    }) => {
      const select = timezoneSelect(page);
      await expect(select.locator('input')).toHaveValue(value);
      await expect(select.locator('.selected-value')).toContainText(label);
      await expect(select.locator('sh-spinner')).toHaveCount(0);
      expect(serverApi.settingsRequests).toHaveLength(0);
    });
  });
}

test.describe('missing setting', () => {
  test('shows the system default', async ({ authenticatedPage: page, serverApi }) => {
    const select = timezoneSelect(page);
    await expect(select.locator('input')).toHaveValue('default');
    await expect(select.locator('.selected-value')).toContainText('System default');
    expect(serverApi.settingsRequests).toHaveLength(0);
  });
});

test.describe('saving time zones', () => {
  test.use({ initialServerSettings: { 'server-timezone': 'UTC' } });

  for (const { label, value, stored } of [
    { label: '(UTC+01:00) Central European Time', value: 'Europe/Copenhagen', stored: 'Europe/Copenhagen' },
    { label: 'System default', value: 'default', stored: '' },
  ]) {
    test(`saves ${value} using the canonical server value`, async ({ authenticatedPage: page, serverApi }) => {
      const select = timezoneSelect(page);
      await expect(select.locator('input')).toHaveValue('UTC');
      await select.locator('sh-form-field').click();
      await page.getByRole('option', { name: label, exact: true }).click();
      await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
      const request = serverApi.settingsRequests[0].request();
      expect(request.postDataJSON()).toEqual({ 'server-timezone': stored });
      expect(request.headers()['authorization']).toBe('Bearer fixture-access-token');
      await expect(select.locator('input')).toHaveValue(value);
      await expect(select.locator('.selected-value')).toContainText(label);
      await expect(select.locator('sh-spinner')).toBeVisible();

      const response = page.waitForResponse((response) => response.request() === request);
      await serverApi.settingsRequests[0].fulfill({ status: 200, json: {} });
      expect((await response).status()).toBe(200);
      await expect(select.locator('input')).toHaveValue(value);
      await expect(select.locator('sh-spinner')).toHaveCount(0);
      expect(serverApi.settingsRequests).toHaveLength(1);
    });
  }

  test('finds a time zone by typing part of its id', async ({ authenticatedPage: page, serverApi }) => {
    const select = timezoneSelect(page);
    await select.locator('sh-form-field').click();
    await select.locator('input').fill('copenh');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.getByRole('option', { name: '(UTC+01:00) Central European Time', exact: true }).click();
    await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
    expect(serverApi.settingsRequests[0].request().postDataJSON()).toEqual({ 'server-timezone': 'Europe/Copenhagen' });
    await serverApi.settingsRequests[0].fulfill({ status: 200, json: {} });
    await expect(select.locator('input')).toHaveValue('Europe/Copenhagen');
  });

  test('restores a rejected setting and reports the error', async ({ authenticatedPage: page, serverApi }) => {
    const select = timezoneSelect(page);
    await select.locator('sh-form-field').click();
    await page.getByRole('option', { name: 'System default', exact: true }).click();
    await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
    await serverApi.settingsRequests[0].fulfill({ status: 500, json: { Error: 'Rejected by test' } });
    await expect(select.locator('input')).toHaveValue('UTC');
    await expect(select.locator('sh-spinner')).toHaveCount(0);
    expect(serverApi.pageErrors).toEqual([]);
  });
});
