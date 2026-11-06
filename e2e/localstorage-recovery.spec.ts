import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function logIn(page: Page, loginRequests: Route[]) {
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  await page.getByPlaceholder('Enter your password').fill('browser-test-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect.poll(() => loginRequests.length).toBe(1);
  expect(loginRequests[0].request().postDataJSON().RememberMe).toBe(false);
  await loginRequests[0].fulfill({
    json: { AccessToken: 'fixture-access-token', RefreshNonce: 'fixture-refresh-nonce' },
  });
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
}

for (const preference of [
  { name: 'rememberMe', key: 'v1:persist:duplicati:rememberMe' },
  { name: 'darkTheme', key: 'v1:persist:duplicati:darkTheme' },
  { name: 'viewMode', key: 'v1:duplicati:viewMode' },
]) {
  test(`recovers from malformed ${preference.name} without clearing unrelated storage`, async ({ page, serverApi }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, '{broken');
      localStorage.setItem('unrelated-app:value', 'retained');
    }, preference.key);
    await page.goto('/login');
    await logIn(page, serverApi.loginRequests);
    expect(await page.evaluate(() => localStorage.getItem('unrelated-app:value'))).toBe('retained');
    if (preference.name === 'rememberMe') {
      expect(await page.evaluate((key) => localStorage.getItem(key), preference.key)).toBe('false');
    }
    if (preference.name === 'darkTheme') {
      await expect(page.locator('html')).toHaveClass(/\blight\b/);
      await page.locator('app-layout [sidenav] > header button').click();
      await expect(page.locator('html')).toHaveClass(/\bdark\b/);
      expect(await page.evaluate((key) => localStorage.getItem(key), preference.key)).toBe('true');
    }
  });
}
