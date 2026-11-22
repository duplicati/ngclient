import type { Locator, Page, Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

function notification(id: number, type: 'Information' | 'Warning' | 'Error' = 'Information') {
  return {
    ID: id,
    Type: type,
    Title: `Notification ${id}`,
    Message: `Message ${id}`,
    Exception: null,
    BackupID: null,
    Action: null,
    Timestamp: '2026-11-08T00:00:00Z',
    LogEntryID: null,
    MessageID: null,
    MessageLogTag: null,
  };
}

const initialNotifications = () => [notification(11), notification(22, 'Warning'), notification(33, 'Error')];
const bell = (page: Page) =>
  page.locator('app-service-hub > button').filter({ has: page.locator('sh-icon', { hasText: /^bell(-ringing)?$/ }) });
const row = (panel: Locator, id: number) =>
  panel.locator('app-notification').filter({
    has: panel.page().getByText(`Notification ${id}`, { exact: true }),
  });
const titles = (panel: Locator) => panel.locator('app-notification [ship-alert-title]');

async function openNotifications(page: Page) {
  await bell(page).click();
  const panel = page.locator('app-service-hub .alert-stream-modal');
  await expect(panel.getByRole('heading', { name: /Notifications/ })).toBeVisible();
  return panel;
}

async function holdDismissals(page: Page) {
  const requests: Route[] = [];
  await page.route('**/api/v1/notification/*', (route) => {
    expect(route.request().method()).toBe('DELETE');
    requests.push(route);
  });
  return requests;
}

test('notification updates render severity and dismissal sends the selected ID after the list changes', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const requests = await holdDismissals(page);
  serverApi.sendNotifications(initialNotifications());
  await expect(bell(page)).toHaveClass(/\berror\b/);
  const panel = await openNotifications(page);
  await expect(titles(panel)).toHaveText(['Notification 11', 'Notification 22', 'Notification 33']);
  await expect(row(panel, 11).locator('sh-alert')).toHaveClass(/\bprimary\b/);
  await expect(row(panel, 22).locator('sh-alert')).toHaveClass(/\bwarn\b/);
  await expect(row(panel, 33).locator('sh-alert')).toHaveClass(/\berror\b/);
  await expect(row(panel, 11).locator('strong')).toHaveCount(0);
  await expect(row(panel, 22).getByText('Warning', { exact: true })).toBeVisible();
  await expect(row(panel, 33).getByText('Error', { exact: true })).toBeVisible();

  await row(panel, 22).getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(new URL(requests[0].request().url()).pathname).toBe('/api/v1/notification/22');
  // The selected row disappears before the server responds, without hiding its neighbors.
  await expect(titles(panel)).toHaveText(['Notification 11', 'Notification 33']);
  await requests[0].fulfill({ status: 204 });

  serverApi.sendNotifications([notification(44), notification(33, 'Error'), notification(11)]);
  await expect(titles(panel)).toHaveText(['Notification 44', 'Notification 33', 'Notification 11']);
  await row(panel, 33).getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(new URL(requests[1].request().url()).pathname).toBe('/api/v1/notification/33');
  await expect(titles(panel)).toHaveText(['Notification 44', 'Notification 11']);
  await requests[1].fulfill({ status: 204 });
  await expect(bell(page)).toHaveClass(/\berror\b/);
});

test('a failed dismissal restores the ordered list and retries the same notification', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const requests = await holdDismissals(page);
  serverApi.sendNotifications(initialNotifications());
  const panel = await openNotifications(page);
  await expect(titles(panel)).toHaveText(['Notification 11', 'Notification 22', 'Notification 33']);
  await row(panel, 22).getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(titles(panel)).toHaveText(['Notification 11', 'Notification 33']);
  await requests[0].fulfill({ status: 503, json: { Error: 'Notification deletion temporarily unavailable' } });
  await expect(titles(panel)).toHaveText(['Notification 11', 'Notification 22', 'Notification 33']);

  await row(panel, 22).getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests.map((route) => new URL(route.request().url()).pathname)).toEqual([
    '/api/v1/notification/22',
    '/api/v1/notification/22',
  ]);
  await requests[1].fulfill({ status: 204 });
  await expect(titles(panel)).toHaveText(['Notification 11', 'Notification 33']);
  await expect(bell(page)).toHaveClass(/\berror\b/);
});

test('an open empty list receives pushed notifications and returns to empty when the server clears them', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  await expect(bell(page)).not.toHaveClass(/\berror\b/);
  const panel = await openNotifications(page);
  await expect(panel.getByText('No more notifications', { exact: true })).toBeVisible();
  serverApi.sendNotifications([notification(77, 'Warning')]);
  await expect(titles(panel)).toHaveText(['Notification 77']);
  await expect(row(panel, 77)).toContainText('Message 77');
  await expect(bell(page)).toHaveClass(/\berror\b/);

  serverApi.sendNotifications([]);
  await expect(panel.locator('app-notification')).toHaveCount(0);
  await expect(panel.getByText('No more notifications', { exact: true })).toBeVisible();
  await expect(bell(page)).not.toHaveClass(/\berror\b/);
  expect(serverApi.requests.filter((request) => request.method() === 'DELETE')).toHaveLength(0);
});

test('a restore download notification gets a token for the download and links to the file', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const tokens: Route[] = [];
  await page.route('**/api/v1/auth/issuetoken/*', (route) => {
    tokens.push(route);
  });
  // The file itself is not fetched in the test
  await page.route('**/api/v1/restore-download/**', (route) => route.abort());
  serverApi.sendNotifications([{ ...notification(55), Action: 'restore:download:9' }]);
  const panel = await openNotifications(page);

  await row(panel, 55).getByRole('button', { name: 'Download', exact: true }).click();
  await expect.poll(() => tokens.length).toBe(1);
  expect(new URL(tokens[0].request().url()).pathname).toBe('/api/v1/auth/issuetoken/restore-download');
  await tokens[0].fulfill({ json: { Token: 'one/time+token' } });

  const link = row(panel, 55).getByRole('link', { name: /right click/ });
  await expect(link).toHaveAttribute('href', /\/api\/v1\/restore-download\/9\?token=one%2Ftime%2Btoken/);
  await expect(row(panel, 55).getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);
});
