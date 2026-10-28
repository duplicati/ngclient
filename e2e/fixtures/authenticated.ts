import { expect, test as base, type Page, type Request, type Route, type WebSocketRoute } from '@playwright/test';

export const sessionNonceKey = 'refreshNonce';
export const persistentNonceKey = 'v1:persist:duplicati:refreshNonce';

async function setupAuthentication(
  page: Page,
  initialBackups: unknown[],
  initialServerSettings: Record<string, string>
) {
  const loginRequests: Route[] = [];
  const refreshRequests: Route[] = [];
  const settingsRequests: Route[] = [];
  const requests: Request[] = [];
  const unexpectedRequests: string[] = [];
  const socketTokens: string[] = [];
  const pageErrors: string[] = [];
  const sockets = new Set<WebSocketRoute>();
  const subscriptions: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Each test has a fresh browser context. Do not clear storage on reload:
  // the second navigation must use the nonce saved by the real login flow.
  await page.addInitScript(() => localStorage.setItem('v1:duplicati:locale', 'en-US'));

  const serverSettings = {
    'shown-welcome-page-v1': 'True',
    'has-asked-for-password-change': 'True',
    'machine-name': 'Browser test server',
    'startup-delay': '',
    ...initialServerSettings,
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
      DefaultUsageReportLevel: 'information',
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
    '/api/v1/backups': initialBackups,
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
    if (request.method() === 'PATCH' && endpoint === '/api/v1/serversettings') {
      settingsRequests.push(route);
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
    backuplist: initialBackups,
    notifications: [],
    remotecontrol: { State: 'inactive', CanEnable: false },
  };
  await page.routeWebSocket('**/notifications*', (socket) => {
    sockets.add(socket);
    socket.onClose(() => sockets.delete(socket));
    socket.onMessage((message) => {
      const request = JSON.parse(String(message));
      if (request.Action === 'sub') subscriptions.push(request.Service);
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

  const sendBackupList = (backups: unknown[]) => {
    getResponses['/api/v1/backups'] = backups;
    subscriptionResponses.backuplist = backups;
    for (const socket of sockets) {
      socket.send(JSON.stringify({ Type: 'backuplist', ApiVersion: 1, Data: backups }));
    }
  };

  return {
    loginRequests,
    refreshRequests,
    settingsRequests,
    requests,
    unexpectedRequests,
    socketTokens,
    pageErrors,
    subscriptions,
    sendBackupList,
  };
}

type ServerApi = Awaited<ReturnType<typeof setupAuthentication>>;

export const test = base.extend<{
  serverApi: ServerApi;
  authenticatedPage: Page;
  initialBackups: unknown[];
  initialServerSettings: Record<string, string>;
}>({
  initialBackups: [[], { option: true }],
  initialServerSettings: [{}, { option: true }],
  serverApi: async ({ page, initialBackups, initialServerSettings }, use) => {
    const api = await setupAuthentication(page, initialBackups, initialServerSettings);
    await use(api);
    expect(api.unexpectedRequests, 'Unexpected API or WebSocket requests').toEqual([]);
    expect(api.pageErrors, 'Unhandled browser errors').toEqual([]);
  },
  authenticatedPage: async ({ page, serverApi }, use) => {
    // Exercise the real login UI rather than injecting an in-memory access token.
    await page.goto('/login');
    await page.getByPlaceholder('Enter your password').fill('browser-test-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect.poll(() => serverApi.loginRequests.length).toBe(1);
    await serverApi.loginRequests[0].fulfill({
      status: 200,
      json: { AccessToken: 'fixture-access-token', RefreshNonce: 'fixture-refresh-nonce' },
    });
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
    await expect.poll(() => serverApi.socketTokens).toEqual(['fixture-access-token']);
    await use(page);
  },
});

export { expect };
