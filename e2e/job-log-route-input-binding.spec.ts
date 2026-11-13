import { expect, test } from './fixtures/authenticated';

const job = (id: string, operation: 'Backup' | 'Sync' = 'Backup') => ({
  Backup: {
    ID: id,
    Name: `Job ${id}`,
    OperationType: operation,
    ExternalID: null,
    Description: '',
    Tags: [],
    TargetURL: 'file:///archive',
    DBPath: `/data/${id}.sqlite`,
    DBPathExists: true,
    Sources: ['/source'],
    Settings: [],
    Filters: [],
    Metadata: {},
    IsTemporary: false,
    IsUnencryptedOrPassphraseStored: true,
    AdditionalTargetURLs: [],
  },
  Schedule: null,
});
const jobs = [job('42'), job('43', 'Sync'), job('44')];
test.use({ initialBackups: [jobs, { scope: 'test' }] });

test('keeps log requests and Sync visibility aligned with reused route IDs and browser history', async ({
  authenticatedPage: page,
}) => {
  const generalIds: string[] = [];
  const remoteIds: string[] = [];
  const writes: string[] = [];
  await page.route('**/api/v1/backup/*', (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split('/').at(-1);
    if (request.method() !== 'GET') writes.push(request.method());
    return route.fulfill({ json: jobs.find((item) => item.Backup.ID === id) ?? {} });
  });
  await page.route('**/api/v1/backup/*/log*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
    generalIds.push(id);
    return route.fulfill({
      json: [
        {
          ID: 1,
          OperationID: 1,
          Timestamp: 1700000000,
          Type: 'Event',
          Message: `General log for ${id}`,
          Exception: {},
        },
      ],
    });
  });
  await page.route('**/api/v1/backup/*/remotelog*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
    remoteIds.push(id);
    return route.fulfill({
      json: [
        {
          ID: 1,
          OperationID: 1,
          Timestamp: 1700000000,
          Operation: 'put',
          Path: `${id}-volume.aes`,
          Data: '{"Size":10}',
        },
      ],
    });
  });
  const navigate = (path: string) =>
    page.evaluate((path) => {
      history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  const title = page.locator('app-log .backup h3');
  const general = page.locator('app-general-log');
  const remote = page.locator('app-remote-log');

  await navigate('/backup/42/log');
  await expect(title).toContainText('Job 42');
  const shell = await page.locator('app-log').elementHandle();
  await expect(general.locator('article.log-entry')).toHaveCount(1);
  await general.locator('article.log-entry header').click();
  await expect(general.locator('.raw-log code')).toHaveText('General log for 42');
  await page.locator('app-log sh-tabs button[value="destination"]').click();
  await expect(remote).toContainText('42-volume.aes');

  await navigate('/backup/43/log');
  await expect(title).toContainText('Job 43');
  await expect(page.locator('app-log sh-tabs')).toHaveCount(0);
  await expect(remote).toHaveCount(0);
  await expect(general.locator('article.log-entry')).toHaveCount(1);
  await general.locator('article.log-entry header').click();
  await expect(general.locator('.raw-log code')).toHaveText('General log for 43');
  expect(await shell!.evaluate((element) => element.isConnected)).toBe(true);
  expect(remoteIds).toEqual(['42']);

  await navigate('/backup/44/log');
  await expect(title).toContainText('Job 44');
  // Existing behavior retains the chosen tab when the route component is reused.
  await expect(remote).toContainText('44-volume.aes');
  await navigate('/backup/44/log?id=43#details');
  await expect(page).toHaveURL('/backup/44/log?id=43#details');
  await expect(title).toContainText('Job 44');
  expect(generalIds).toEqual(['42', '43']);
  expect(remoteIds).toEqual(['42', '44']);

  await page.goBack();
  await expect(page).toHaveURL('/backup/44/log');
  await page.goBack();
  await expect(page).toHaveURL('/backup/43/log');
  await expect(title).toContainText('Job 43');
  await expect(general.locator('article.log-entry')).toHaveCount(1);
  await page.goForward();
  await expect(page).toHaveURL('/backup/44/log');
  await expect(title).toContainText('Job 44');
  await expect(remote).toContainText('44-volume.aes');
  expect(await shell!.evaluate((element) => element.isConnected)).toBe(true);
  expect(writes).toEqual([]);
});
