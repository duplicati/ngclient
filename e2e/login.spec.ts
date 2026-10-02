import { expect, test, type Route } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('v1:duplicati:locale', 'en-US');
  });
});

test('renders the built login page on direct navigation and reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/login');
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeVisible();

  await page.reload();
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('does not send an authentication request for an empty password', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/**', async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByPlaceholder('Enter your password')).toHaveValue('');
  expect(requests).toEqual([]);
});

test('shows a rejected login and allows another request with edited credentials', async ({ page }, testInfo) => {
  const requests: Route[] = [];
  const unexpectedRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/v1/auth/login') {
      requests.push(route);
      return;
    }
    unexpectedRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto('/login');
  const password = page.getByPlaceholder('Enter your password');
  const login = page.getByRole('button', { name: 'Login', exact: true });
  await password.fill('incorrect-password');
  await login.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].request().method()).toBe('POST');
  expect(requests[0].request().postDataJSON()).toEqual({ Password: 'incorrect-password', RememberMe: false });
  await expect(login).toHaveClass(/loading/);
  await expect(page.getByText('Remember to enter a password', { exact: false })).toHaveCount(0);

  await requests[0].fulfill({ status: 401, json: { Error: 'Invalid password' } });
  await expect(page.getByText('Remember to enter a password', { exact: false })).toBeVisible();
  await expect(login).not.toHaveClass(/loading/);
  await expect(password).toBeFocused();
  await expect(page).toHaveURL('/login');

  await password.fill('edited-password');
  await page.getByRole('checkbox').check();
  await login.click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].request().postDataJSON()).toEqual({ Password: 'edited-password', RememberMe: true });
  await requests[1].fulfill({ status: 401, json: { Error: 'Invalid password' } });
  await expect(login).not.toHaveClass(/loading/);
  await expect(page.getByText('Remember to enter a password', { exact: false })).toBeVisible();
  expect(unexpectedRequests).toEqual([]);

  // Preserve diagnostics without making existing error-reporting behavior a contract.
  if (pageErrors.length) {
    await testInfo.attach('rejected-login-page-errors', {
      body: JSON.stringify(pageErrors, null, 2),
      contentType: 'application/json',
    });
  }
});
