import { expect, test, type Page, type Request, type Route } from '@playwright/test';

const sessionNonceKey = 'refreshNonce';
const persistentNonceKey = 'v1:persist:duplicati:refreshNonce';

async function setupAuthentication(page: Page) {
  const loginRequests: Route[] = [];
  const refreshRequests: Route[] = [];
  const requests: Request[] = [];
  const unexpectedRequests: string[] = [];
  const socketTokens: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Each test has a fresh browser context. Do not clear storage on reload:
  // the second navigation must use the nonce saved by the real login flow.
  await page.addInitScript(() => localStorage.setItem('v1:duplicati:locale', 'en-US'));

  const serverSettings = {
    'shown-welcome-page-v1': 'True',
    'has-asked-for-password-change': 'True',
    'machine-name': 'Browser test server',
  };
  const serverStatus = {
    Type: 'legacystatus',
    ProgramState: 'Running',
    ActiveTask: null,
    SchedulerQueueIds: [],
    ProposedSchedule: [],
    LastEventID: 1,
    LastDataUpdateID: 1,
    LastNotificationUpdateID: 1,
  };
  const getResponses: Record<string, unknown> = {
    '/api/v1/systeminfo': {
      Version: 'Browser test',
      StartedBy: 'TrayIcon',
      BackendModules: [],
      EncryptionModules: [],
      CompressionModules: [],
      GenericModules: [],
      Options: [],
      ServerOnlyOptions: [],
      SpecialFolders: [],
      APIExtensions: [
        'v1:websocket',
        'v1:websocket:authenticate',
        'v1:subscribe:backuplist',
        'v1:subscribe:notifications',
        'v1:subscribe:remotecontrol',
      ],
    },
    '/api/v1/systeminfo/filtergroups': { FilterGroups: {} },
    '/api/v1/webmodules': [],
    '/api/v1/backups': [],
    '/api/v1/serversettings': serverSettings,
    '/api/v1/notifications': [],
    '/api/v1/remotecontrol/status': { State: 'inactive', CanEnable: false },
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    requests.push(request);
    if (request.method() === 'POST' && endpoint === '/api/v1/auth/login') {
      loginRequests.push(route);
      return;
    }
    if (request.method() === 'POST' && endpoint === '/api/v1/auth/refresh') {
      refreshRequests.push(route);
      return;
    }
    if (request.method() === 'POST' && endpoint === '/api/v1/auth/status') {
      await route.fulfill({ status: 200, json: { authorized: false } });
      return;
    }
    if (request.method() === 'GET' && endpoint === '/api/v1/serverstate') {
      // A pending long-poll is cancelled when the home page selects WebSocket.
      // Do not create an immediate-response polling loop in the test server.
      return;
    }
    if (request.method() === 'GET' && Object.hasOwn(getResponses, endpoint)) {
      await route.fulfill({ status: 200, json: getResponses[endpoint] });
      return;
    }
    unexpectedRequests.push(`${request.method()} ${endpoint}`);
    await route.abort();
  });

  const subscriptionResponses: Record<string, unknown> = {
    legacystatus: serverStatus,
    serversettings: serverSettings,
    backuplist: [],
    notifications: [],
    remotecontrol: { State: 'inactive', CanEnable: false },
  };
  await page.routeWebSocket('**/notifications*', (socket) => {
    socket.onMessage((message) => {
      const request = JSON.parse(String(message));
      if (request.Action === 'auth') {
        socketTokens.push(request.Token);
        socket.send(JSON.stringify({ Version: 1, Success: true }));
      } else if (request.Action === 'sub' && request.Service === 'taskcompleted') {
        // An idle server acknowledges the subscription without completing a task.
        socket.send(
          JSON.stringify({ Version: 1, Type: 'reply', Id: request.Id, Service: request.Service, Success: true })
        );
      } else if (request.Action === 'sub' && Object.hasOwn(subscriptionResponses, request.Service)) {
        socket.send(
          JSON.stringify(
            request.Service === 'legacystatus'
              ? serverStatus
              : { Type: request.Service, ApiVersion: 1, Data: subscriptionResponses[request.Service] }
          )
        );
      } else {
        unexpectedRequests.push(`WebSocket ${String(message)}`);
      }
    });
  });

  return { loginRequests, refreshRequests, requests, unexpectedRequests, socketTokens, pageErrors };
}

for (const rememberMe of [false, true]) {
  test(`logs in and restores authentication after reload with Remember Me ${rememberMe}`, async ({ page }) => {
    const api = await setupAuthentication(page);
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
