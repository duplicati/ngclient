import { expect, test, sessionNonceKey, persistentNonceKey } from './fixtures/authenticated';

test('provides the authenticated home screen with an idle server', async ({ authenticatedPage: page, serverApi }) => {
  await expect(page.getByRole('heading', { name: 'Backups', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restores', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Enter your password')).toHaveCount(0);
  const systemInfo = serverApi.requests.filter((request) => new URL(request.url()).pathname === '/api/v1/systeminfo');
  expect(systemInfo).toHaveLength(1);
  expect(systemInfo[0].headers()['authorization']).toBe('Bearer fixture-access-token');
  expect(serverApi.loginRequests[0].request().postDataJSON()).toEqual({
    Password: 'browser-test-password',
    RememberMe: false,
  });
  // A following test must not inherit this test's storage changes.
  await page.evaluate(
    ({ sessionKey, persistentKey }) => {
      sessionStorage.setItem(sessionKey, 'changed-by-test');
      localStorage.setItem(persistentKey, 'changed-by-test');
    },
    { sessionKey: sessionNonceKey, persistentKey: persistentNonceKey }
  );
});

test('starts with isolated nonce storage and request history', async ({ authenticatedPage: page, serverApi }) => {
  expect(
    await page.evaluate(
      ({ sessionKey, persistentKey }) => ({
        session: sessionStorage.getItem(sessionKey),
        persistent: localStorage.getItem(persistentKey),
      }),
      { sessionKey: sessionNonceKey, persistentKey: persistentNonceKey }
    )
  ).toEqual({ session: 'fixture-refresh-nonce', persistent: null });
  expect(serverApi.loginRequests).toHaveLength(1);
  expect(serverApi.refreshRequests).toHaveLength(0);
  expect(serverApi.socketTokens).toEqual(['fixture-access-token']);
});
