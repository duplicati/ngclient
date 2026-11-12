import { type Route } from '@playwright/test';
import { expect, test, sessionNonceKey, persistentNonceKey } from './fixtures/authenticated';

for (const rememberMe of [false, true]) {
  test(`logout waits for completion and clears authentication with Remember Me ${rememberMe}`, async ({
    page,
    serverApi: api,
  }) => {
    const logoutRequests: Route[] = [];
    await page.route('**/api/v1/auth/refresh/logout', (route) => {
      logoutRequests.push(route);
    });
    await page.goto('/login');
    await page.getByPlaceholder('Enter your password').fill('browser-test-password');
    await page.getByRole('checkbox').setChecked(rememberMe);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect.poll(() => api.loginRequests.length).toBe(1);
    await api.loginRequests[0].fulfill({
      json: { AccessToken: 'logout-test-token', RefreshNonce: 'logout-test-nonce' },
    });
    await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
    const storage = () =>
      page.evaluate(
        ({ sessionKey, persistentKey }) => ({
          session: sessionStorage.getItem(sessionKey),
          persistent: localStorage.getItem(persistentKey),
        }),
        { sessionKey: sessionNonceKey, persistentKey: persistentNonceKey }
      );
    expect(await storage()).toEqual({
      session: rememberMe ? null : 'logout-test-nonce',
      persistent: rememberMe ? 'logout-test-nonce' : null,
    });
    // Exercise the logout route itself; the sidebar calls the auth state directly.
    await page.evaluate(() => {
      history.pushState(null, '', '/logout');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect.poll(() => logoutRequests.length).toBe(1);
    expect(logoutRequests[0].request().method()).toBe('POST');
    expect(logoutRequests[0].request().postDataJSON()).toEqual({ Nonce: 'logout-test-nonce' });
    await expect(page).toHaveURL('/logout');
    await expect(page.getByRole('heading', { name: 'Logging out...', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to login page', exact: true })).toHaveCount(0);
    expect(await storage()).toEqual({ session: null, persistent: null });
    await logoutRequests[0].fulfill({ json: {} });
    await expect(page).toHaveURL('/login');
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toHaveCount(0);
    expect(api.refreshRequests).toHaveLength(0);
    expect(logoutRequests).toHaveLength(1);
    expect(await storage()).toEqual({ session: null, persistent: null });
  });
}
