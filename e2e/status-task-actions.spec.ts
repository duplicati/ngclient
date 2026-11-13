import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function navigate(page: Page, path: string) {
  await page.evaluate((url) => {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function prepare(page: Page) {
  let taskId = 73;
  const stops: Route[] = [];
  const aborts: Route[] = [];
  await page.route('**/api/v1/logdata/poll?*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/task/*/stop', (route) => {
    stops.push(route);
  });
  await page.route('**/api/v1/task/*/abort', (route) => {
    aborts.push(route);
  });
  await page.route(/\/api\/v1\/task\/\d+$/, (route) => route.fulfill({ json: { ID: taskId, Status: 'Running' } }));
  await page.route('**/api/v1/progressstate', (route) =>
    route.fulfill({
      json: {
        TaskID: taskId,
        BackupID: null,
        Phase: 'Backup_ProcessingFiles',
        StillCounting: false,
        ProcessedFileCount: 4,
        TotalFileCount: 10,
        ProcessedFileSize: 40,
        TotalFileSize: 100,
        CurrentFilename: `/source/current-${taskId}.txt`,
        CurrentFilesize: 100,
        CurrentFileoffset: 40,
      },
    })
  );
  const stop = page
    .locator('app-status .task-card')
    .getByRole('button', { name: 'Stop after current file', exact: true });
  const abort = page.locator('app-status .task-card').getByRole('button', { name: 'Abort', exact: true });
  const ready = async () => {
    await navigate(page, '/status');
    await expect(page.locator('app-status')).toContainText(`current-${taskId}.txt`);
  };
  return {
    stops,
    aborts,
    stop,
    abort,
    ready,
    setTask: (id: number) => {
      taskId = id;
    },
  };
}

test('status avoids duplicate actions and still allows Abort during a pending graceful Stop', async ({
  authenticatedPage: page,
  serverApi: api,
}) => {
  const view = await prepare(page);
  api.sendServerStatus({ ActiveTask: { Item1: 73, Item2: null } });
  await view.ready();
  await view.stop.click();
  await expect.poll(() => view.stops.length).toBe(1);
  await expect(view.stop).toBeDisabled();
  await expect(view.abort).toBeEnabled();
  await view.stop.dispatchEvent('click');
  await view.abort.click();
  await expect.poll(() => view.aborts.length).toBe(1);
  await expect(view.abort).toBeDisabled();
  await view.abort.dispatchEvent('click');
  expect(view.stops).toHaveLength(1);
  expect(view.aborts).toHaveLength(1);
  expect(view.stops[0].request().method()).toBe('POST');
  expect(view.aborts[0].request().url()).toMatch(/\/task\/73\/abort$/);
  await view.stops[0].fulfill({ json: {} });
  await expect(view.stop).toBeDisabled();
  await view.aborts[0].fulfill({ json: {} });
  await expect(view.stop).toBeEnabled();
  await expect(view.abort).toBeEnabled();
});

test('status keeps a new task pending when the previous task action finishes late', async ({
  authenticatedPage: page,
  serverApi: api,
}) => {
  const view = await prepare(page);
  api.sendServerStatus({ ActiveTask: { Item1: 73, Item2: null } });
  await view.ready();
  await view.stop.click();
  await expect.poll(() => view.stops.length).toBe(1);
  view.setTask(74);
  api.sendServerStatus({ ActiveTask: { Item1: 74, Item2: null } });
  await expect(page.locator('app-status')).toContainText('current-74.txt');
  await expect(view.stop).toBeEnabled();
  await view.stop.click();
  await expect.poll(() => view.stops.length).toBe(2);
  expect(view.stops[1].request().url()).toMatch(/\/task\/74\/stop$/);
  await view.stops[0].fulfill({ json: {} });
  await expect(view.stop).toBeDisabled();
  await view.stops[1].fulfill({ json: {} });
  await expect(view.stop).toBeEnabled();
});

test('status can retry a failed Stop and isolates a pending action after leaving and returning', async ({
  authenticatedPage: page,
  serverApi: api,
}) => {
  const view = await prepare(page);
  api.sendServerStatus({ ActiveTask: { Item1: 73, Item2: null } });
  await view.ready();
  await view.stop.click();
  await expect.poll(() => view.stops.length).toBe(1);
  await view.stops[0].fulfill({ status: 500, json: { Error: 'Stop failed' } });
  await expect(view.stop).toBeEnabled();
  await view.stop.click();
  await expect.poll(() => view.stops.length).toBe(2);
  await navigate(page, '/');
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  await view.ready();
  await expect(view.stop).toBeEnabled();
  await view.stop.click();
  await expect.poll(() => view.stops.length).toBe(3);
  const oldResponse = page.waitForResponse((response) => response.request() === view.stops[1].request());
  await view.stops[1].fulfill({ json: {} });
  await (await oldResponse).finished();
  await expect(view.stop).toBeDisabled();
  await view.stops[2].fulfill({ json: {} });
  await expect(view.stop).toBeEnabled();
});
