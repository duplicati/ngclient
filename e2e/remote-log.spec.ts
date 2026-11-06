import { expect, test } from './fixtures/authenticated';

test('a plain remote delete error does not hide other log rows and copies verbatim', async ({
  authenticatedPage: page,
}) => {
  const raw = 'System.IO.IOException: Access denied\n at DeleteAsync() <script>throw 1</script>';
  await page.route('**/api/v1/backup/42/log*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({ json: { Backup: { ID: '42', OperationType: 'Backup', Settings: [] } } })
  );
  await page.route('**/api/v1/backup/42/remotelog*', (route) =>
    route.fulfill({
      json: [
        {
          ID: 1,
          OperationID: 7,
          Timestamp: 1700000000,
          Operation: 'put',
          Path: 'first.aes',
          Data: '{"Hash":"abc","Size":10}',
        },
        { ID: 2, OperationID: 7, Timestamp: 1700000001, Operation: 'delete', Path: 'broken-volume.aes', Data: raw },
        { ID: 3, OperationID: 7, Timestamp: 1700000002, Operation: 'list', Path: '', Data: '[{"Name":"last.aes"}]' },
      ],
    })
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          sessionStorage.setItem('test:remote-log-copy', text);
        },
      },
    });
    history.pushState(null, '', '/backup/42/log');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.locator('sh-tabs button[value="destination"]').click();
  const rows = page.locator('app-remote-log article.log-entry');
  await expect(rows).toHaveCount(3);
  const failed = rows.filter({ hasText: 'broken-volume.aes' });
  await failed.locator('header').click();
  await expect(failed.locator('code')).toHaveText(raw);
  expect(await failed.locator('script').count()).toBe(0);
  await failed.getByRole('button', { name: 'Copy to clipboard', exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('test:remote-log-copy'))).toBe(raw);
  await expect(failed.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  const valid = rows.filter({ hasText: 'first.aes' });
  await valid.locator('header').click();
  await expect(valid.locator('code')).toContainText('"Hash": "abc"');
  await expect(valid.locator('code')).toContainText('"Size": 10');
});
