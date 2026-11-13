import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const progress = (id: number) => ({
  TaskID: id,
  BackupID: null,
  Phase: 'Backup_ProcessingFiles',
  StillCounting: false,
  TotalFileCount: 10,
  ProcessedFileCount: 1,
  TotalFileSize: 100,
  ProcessedFileSize: 10,
  CurrentFilename: `current-${id}.txt`,
  CurrentFilesize: 100,
  CurrentFileoffset: 0,
  CurrentFilecomplete: true,
});
async function prepare(page: Page) {
  const reads: Route[] = [];
  const oldTasks: Route[] = [];
  await page.route('**/api/v1/progressstate', (route) => {
    reads.push(route);
  });
  await page.route(/\/api\/v1\/task\/\d+$/, (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    if (id === 73) {
      oldTasks.push(route);
      return;
    }
    return route.fulfill({ json: { ID: id, Status: 'Running' } });
  });
  await page.route('**/api/v1/logdata/poll?*', (route) => route.fulfill({ json: [] }));
  await page.clock.install();
  await page.evaluate(() => {
    history.pushState(null, '', '/status');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  return { reads, oldTasks };
}

test('progress polling waits for both APIs and ignores task information from the previous task', async ({
  authenticatedPage: page,
  serverApi: api,
}) => {
  const { reads, oldTasks } = await prepare(page);
  api.sendServerStatus({ ActiveTask: { Item1: 73, Item2: null } });
  await page.clock.runFor(5000);
  await expect.poll(() => reads.length).toBe(1);
  await reads[0].fulfill({ json: progress(73) });
  await expect.poll(() => oldTasks.length).toBe(1);
  await page.clock.runFor(4000);
  expect(reads).toHaveLength(1);
  api.sendServerStatus({ ActiveTask: { Item1: 74, Item2: null } });
  await page.clock.runFor(1000);
  await expect.poll(() => reads.length).toBe(2);
  await reads[1].fulfill({ json: progress(74) });
  await expect(page.locator('app-status .files-card .file-row:not(.recent) .name')).toHaveText('current-74.txt');
  const oldResponse = page.waitForResponse((response) => response.request() === oldTasks[0].request());
  await oldTasks[0].fulfill({ json: { ID: 73, Status: 'Completed' } });
  await (await oldResponse).finished();
  await expect(page.locator('app-status .files-card .file-row:not(.recent) .name')).toHaveText('current-74.txt');
});

test('obsolete progress does not start a task lookup after a task change', async ({
  authenticatedPage: page,
  serverApi: api,
}) => {
  const { reads, oldTasks } = await prepare(page);
  api.sendServerStatus({ ActiveTask: { Item1: 73, Item2: null } });
  await page.clock.runFor(1000);
  await expect.poll(() => reads.length).toBe(1);
  api.sendServerStatus({ ActiveTask: { Item1: 74, Item2: null } });
  await page.clock.runFor(1000);
  await expect.poll(() => reads.length).toBe(2);
  const oldResponse = page.waitForResponse((response) => response.request() === reads[0].request());
  await reads[0].fulfill({ json: progress(73) });
  await (await oldResponse).finished();
  await reads[1].fulfill({ json: progress(74) });
  await expect(page.locator('app-status .files-card .file-row:not(.recent) .name')).toHaveText('current-74.txt');
  expect(oldTasks).toHaveLength(0);
});
