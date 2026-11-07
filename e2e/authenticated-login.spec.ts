import { expect, test, sessionNonceKey, persistentNonceKey } from './fixtures/authenticated';

for (const rememberMe of [false, true]) {
  test(`logs in and restores authentication after reload with Remember Me ${rememberMe}`, async ({
    page,
    serverApi: api,
  }) => {
    const initialToken = 'login-access-token';
    const initialNonce = 'login-refresh-nonce';
    const refreshedToken = 'refreshed-access-token';
    const refreshedNonce = 'rotated-refresh-nonce';

    const nonceStorage = () =>
      page.evaluate(
        ({ sessionKey, persistentKey }) => ({
          session: sessionStorage.getItem(sessionKey),
          persistent: localStorage.getItem(persistentKey),
        }),
        { sessionKey: sessionNonceKey, persistentKey: persistentNonceKey }
      );
    const systemInfoRequests = () =>
      api.requests.filter((request) => new URL(request.url()).pathname === '/api/v1/systeminfo');
    const assertHome = async () => {
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Backups', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Restores', exact: true })).toBeVisible();
      await expect(page.getByPlaceholder('Enter your password')).toHaveCount(0);
    };

    await page.goto('/login');
    await page.getByPlaceholder('Enter your password').fill('browser-test-password');
    await page.getByRole('checkbox').setChecked(rememberMe);
    const login = page.getByRole('button', { name: 'Login', exact: true });
    await login.click();
    await expect.poll(() => api.loginRequests.length).toBe(1);
    expect(api.loginRequests[0].request().postDataJSON()).toEqual({
      Password: 'browser-test-password',
      RememberMe: rememberMe,
    });
    await expect(login).toHaveClass(/loading/);
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toHaveCount(0);

    await api.loginRequests[0].fulfill({
      status: 200,
      json: { AccessToken: initialToken, RefreshNonce: initialNonce },
    });
    await assertHome();
    await expect.poll(() => api.socketTokens).toEqual([initialToken]);
    expect(systemInfoRequests()).toHaveLength(1);
    expect(systemInfoRequests()[0].headers()['authorization']).toBe(`Bearer ${initialToken}`);
    expect(await nonceStorage()).toEqual({
      session: rememberMe ? null : initialNonce,
      persistent: rememberMe ? initialNonce : null,
    });
    expect(api.refreshRequests).toHaveLength(0);

    await page.reload();
    await expect.poll(() => api.refreshRequests.length).toBe(1);
    expect(api.refreshRequests[0].request().postDataJSON()).toEqual({ Nonce: initialNonce });
    expect(systemInfoRequests()).toHaveLength(1);
    await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toHaveCount(0);

    await api.refreshRequests[0].fulfill({
      status: 200,
      json: { AccessToken: refreshedToken, RefreshNonce: refreshedNonce },
    });
    await assertHome();
    await expect.poll(() => api.socketTokens).toEqual([initialToken, refreshedToken]);
    expect(systemInfoRequests()).toHaveLength(2);
    expect(systemInfoRequests()[1].headers()['authorization']).toBe(`Bearer ${refreshedToken}`);
    expect(await nonceStorage()).toEqual({
      session: rememberMe ? null : refreshedNonce,
      persistent: rememberMe ? refreshedNonce : null,
    });
    expect(api.loginRequests).toHaveLength(1);
    expect(api.refreshRequests).toHaveLength(1);
    expect(api.unexpectedRequests).toEqual([]);
    expect(api.pageErrors).toEqual([]);
  });
}

test('recovers without reload after a rejected socket and a transient token-refresh failure', async ({
  page,
  serverApi: api,
}) => {
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener('close', () => {
          document.documentElement.dataset['testSocketClosed'] = 'true';
        });
      }
    };
  });
  const tokens: string[] = [];
  let firstSocket: import('@playwright/test').WebSocketRoute | undefined;
  await page.routeWebSocket('**/notifications*', (socket) => {
    firstSocket ??= socket;
    socket.onMessage((message) => {
      const command = JSON.parse(String(message));
      if (command.Action === 'auth') {
        tokens.push(command.Token);
        socket.send(JSON.stringify({ Version: 1, Success: command.Token === 'recovered-token', Message: 'Expired' }));
      } else if (command.Action === 'sub') {
        if (command.Service === 'legacystatus')
          socket.send(
            JSON.stringify({
              Type: 'legacystatus',
              ProgramState: 'Running',
              ActiveTask: null,
              SchedulerQueueIds: [],
              ProposedSchedule: [],
              LastEventID: 1,
            })
          );
        else if (command.Service === 'backuplist' || command.Service === 'notifications')
          socket.send(JSON.stringify({ Type: command.Service, ApiVersion: 1, Data: [] }));
        else if (command.Service === 'remotecontrol')
          socket.send(
            JSON.stringify({ Type: command.Service, ApiVersion: 1, Data: { State: 'inactive', CanEnable: false } })
          );
        else socket.send(JSON.stringify({ Type: 'reply', Id: command.Id, Service: command.Service, Success: true }));
      }
    });
  });
  await page.goto('/login');
  await page.getByPlaceholder('Enter your password').fill('browser-test-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect.poll(() => api.loginRequests.length).toBe(1);
  await api.loginRequests[0].fulfill({ json: { AccessToken: 'expired-token', RefreshNonce: 'valid-nonce' } });
  await expect.poll(() => api.refreshRequests.length).toBe(1);
  // The server closes the rejected socket while the refresh request is pending.
  firstSocket!.close({ code: 1000, reason: 'Authentication rejected' });
  await expect(page.locator('html')).toHaveAttribute('data-test-socket-closed', 'true');
  await api.refreshRequests[0].fulfill({ status: 503, json: { Error: 'Temporarily unavailable' } });
  await expect(page.getByRole('heading', { name: 'Reconnecting...', exact: true })).toBeVisible();
  await expect.poll(() => api.refreshRequests.length, { timeout: 10000 }).toBe(2);
  expect(api.refreshRequests[1].request().postDataJSON()).toEqual({ Nonce: 'valid-nonce' });
  await api.refreshRequests[1].fulfill({ json: { AccessToken: 'recovered-token', RefreshNonce: 'rotated-nonce' } });
  await expect.poll(() => tokens).toEqual(['expired-token', 'expired-token', 'recovered-token']);
  await expect(page.getByRole('heading', { name: 'Reconnecting...', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  expect(api.loginRequests).toHaveLength(1);
});
