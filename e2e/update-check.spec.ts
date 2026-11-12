import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function navigate(page: Page, path: string) {
  await page.evaluate((url) => {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function openGeneral(page: Page) {
  await page.route('**/api/v1/acknowledgements', (route) =>
    route.fulfill({ json: { Acknowledgements: 'Browser test credits' } })
  );
  await navigate(page, '/about/general');
  const check = page.getByRole('button', { name: 'Check for updates', exact: true });
  await expect(check).toBeVisible();
  return check;
}

test('update checks are single flight, can retry after failure, and respect the server checking state', async ({
  authenticatedPage: page,
  serverApi: api,
}) => {
  const requests: Route[] = [];
  await page.route('**/api/v1/updates/check', (route) => {
    requests.push(route);
  });
  api.sendServerStatus({ UpdaterState: 'Waiting' });
  const check = await openGeneral(page);
  await check.click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(check).toBeDisabled();
  await check.dispatchEvent('click');
  expect(requests).toHaveLength(1);
  await requests[0].fulfill({ status: 500, json: { Error: 'Cannot check updates' } });
  await page.locator('app-service-hub > button').first().click();
  await expect(page.getByText('Cannot check updates', { exact: true })).toBeVisible();
  await page.locator('app-service-hub .alert-stream-modal h6 button').click();
  await expect(check).toBeEnabled();
  await check.click();
  await expect.poll(() => requests.length).toBe(2);
  await requests[1].fulfill({ json: {} });
  await expect(check).toBeEnabled();
  api.sendServerStatus({ UpdaterState: 'Checking' });
  const checking = page.getByRole('button', { name: 'Checking for updates …', exact: true });
  await expect(checking).toBeDisabled();
  await checking.dispatchEvent('click');
  api.sendServerStatus({ UpdaterState: 'Waiting' });
  await expect(check).toBeEnabled();
  expect(requests).toHaveLength(2);
});

test('leaving About detaches its pending update check and its late response cannot clear a new check', async ({
  authenticatedPage: page,
  serverApi: api,
}) => {
  const requests: Route[] = [];
  await page.route('**/api/v1/updates/check', (route) => {
    requests.push(route);
  });
  api.sendServerStatus({ UpdaterState: 'Waiting' });
  const check = await openGeneral(page);
  await check.click();
  await expect.poll(() => requests.length).toBe(1);
  await navigate(page, '/');
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  const nextCheck = await openGeneral(page);
  await expect(nextCheck).toBeEnabled();
  await nextCheck.click();
  await expect.poll(() => requests.length).toBe(2);
  const oldResponse = page.waitForResponse((response) => response.request() === requests[0].request());
  await requests[0].fulfill({ json: {} });
  await (await oldResponse).finished();
  await expect(nextCheck).toBeDisabled();
  await requests[1].fulfill({ json: {} });
  await expect(nextCheck).toBeEnabled();
});
