import { expect, test } from './fixtures/authenticated';

test('older job logs use an ID cursor, retry a failed page, and return to newer entries', async ({
  authenticatedPage: page,
}) => {
  const entries = Array.from({ length: 102 }, (_, index) => ({
    ID: 2000 - index * 7,
    OperationID: 7,
    Timestamp: 1700000000 + index,
    Type: 'Event',
    Message: `Log ${2000 - index * 7}`,
    Exception: {},
  }));
  const offsets: Array<string | null> = [];
  let failOlder = true;
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({ json: { Backup: { ID: '42', OperationType: 'Backup', Settings: [] } } })
  );
  await page.route('**/api/v1/backup/42/log*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    const offset = query.get('offset');
    offsets.push(offset);
    if (offset !== null && failOlder) {
      failOlder = false;
      return route.fulfill({ status: 503, json: { Error: 'Database temporarily locked' } });
    }
    const result = entries.filter((entry) => offset === null || entry.ID < Number(offset)).slice(0, 100);
    return route.fulfill({ json: result });
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/log');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const log = page.locator('app-general-log');
  await expect(log.locator('article.log-entry')).toHaveCount(100);
  await expect(log.getByRole('button', { name: 'Newer entries', exact: true })).toBeDisabled();
  await log.getByRole('button', { name: 'Older entries', exact: true }).click();
  await expect(log.getByRole('alert')).toHaveText('Could not load log entries.');
  await log.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(log.locator('article.log-entry')).toHaveCount(2);
  await log.locator('article.log-entry').first().locator('header').click();
  await expect(log.locator('.raw-log code')).toHaveText('Log 1300');
  await expect(log.getByRole('button', { name: 'Older entries', exact: true })).toBeDisabled();
  await log.getByRole('button', { name: 'Newer entries', exact: true }).click();
  await expect(log.locator('article.log-entry')).toHaveCount(100);
  expect(offsets).toEqual([null, '1307', '1307', null]);
});
