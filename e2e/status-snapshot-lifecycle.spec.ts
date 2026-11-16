import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function navigate(page: Page, path: string) {
  await page.evaluate((url) => {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function preparePolling(page: Page) {
  await page.route('**/api/v1/systeminfo', (route) =>
    route.fulfill({
      json: {
        Version: 'Browser test',
        ServerVersionName: 'Browser test',
        StartedBy: 'TrayIcon',
        BackendModules: [],
        EncryptionModules: [],
        CompressionModules: [],
        GenericModules: [],
        Options: [],
        ServerOnlyOptions: [],
        SpecialFolders: [],
        APIExtensions: ['v2:systemstatus'],
      },
    })
  );
  let firstState = true;
  await page.route('**/api/v1/serverstate?*', (route) => {
    if (!firstState) return; // Hold the next long poll instead of spinning immediate responses.
    firstState = false;
    return route.fulfill({
      json: {
        ProgramState: 'Running',
        ActiveTask: null,
        SchedulerQueueIds: [],
        ProposedSchedule: [],
        LastEventID: 1,
        LastDataUpdateID: 1,
        LastNotificationUpdateID: 1,
      },
    });
  });
  await page.route('**/api/v1/logdata/poll?*', (route) => route.fulfill({ json: [] }));
  const requests: Route[] = [];
  await page.route('**/api/v2/system/status', (route) => {
    requests.push(route);
  });
  return requests;
}

const snapshot = (name: string, second: number) => ({
  Success: true,
  Data: {
    Timestamp: new Date(Date.UTC(2026, 10, 13, 0, 0, second)).toISOString(),
    IntervalMs: 60000,
    Machine: { ProcessorCount: 4, CpuUsage: 0, TotalMemory: 8e9, AvailableMemory: 4e9 },
    Processes: [],
    Progress: null,
    Queue: [
      { TaskID: second, BackupID: null, BackupName: name, Operation: 'Verify', Status: 'Waiting', TaskStarted: null },
    ],
  },
});

test('Status polling keeps the current visit snapshot when an older HTTP response arrives', async ({
  page,
  serverApi: api,
}) => {
  const requests = await preparePolling(page);
  await page.goto('/login');
  await page.getByPlaceholder('Enter your password').fill('browser-test-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect.poll(() => api.loginRequests.length).toBe(1);
  await api.loginRequests[0].fulfill({ json: { AccessToken: 'snapshot-token', RefreshNonce: 'snapshot-nonce' } });
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  await navigate(page, '/status');
  await expect.poll(() => requests.length).toBe(1);
  await navigate(page, '/');
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  await navigate(page, '/status');
  await expect.poll(() => requests.length).toBe(2);
  await requests[1].fulfill({ json: snapshot('Current visit', 2) });
  await expect(page.locator('app-status')).toContainText('Current visit');
  const oldResponse = page.waitForResponse((response) => response.request() === requests[0].request());
  await requests[0].fulfill({ json: snapshot('Stale visit', 1) });
  await (await oldResponse).finished();
  await expect(page.locator('app-status')).toContainText('Current visit');
  await expect(page.locator('app-status')).not.toContainText('Stale visit');
  expect(requests).toHaveLength(2);
});

test('a failed snapshot from the old visit does not start extra polling during the current pending read', async ({
  page,
  serverApi: api,
}) => {
  const requests = await preparePolling(page);
  await page.goto('/login');
  await page.getByPlaceholder('Enter your password').fill('browser-test-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect.poll(() => api.loginRequests.length).toBe(1);
  await api.loginRequests[0].fulfill({ json: { AccessToken: 'snapshot-token', RefreshNonce: 'snapshot-nonce' } });
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  await page.clock.install();
  await navigate(page, '/status');
  await expect.poll(() => requests.length).toBe(1);
  await navigate(page, '/');
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  await navigate(page, '/status');
  await expect.poll(() => requests.length).toBe(2);
  const oldResponse = page.waitForResponse((response) => response.request() === requests[0].request());
  await requests[0].fulfill({ status: 500, json: { Error: 'Old snapshot failed' } });
  await (await oldResponse).finished();
  await page.clock.runFor(5000);
  expect(requests).toHaveLength(2);
  await requests[1].fulfill({ json: snapshot('Current visit', 3) });
  await expect(page.locator('app-status')).toContainText('Current visit');
});
