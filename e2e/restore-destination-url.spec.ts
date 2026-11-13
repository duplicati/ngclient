import type { Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

test('direct restore URL edits are isolated until applied and preserve the exact submitted URL', async ({
  authenticatedPage: page,
}) => {
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
  const creates: Route[] = [];
  await page.route('**/api/v1/backups?temporary=true', (route) => {
    creates.push(route);
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/restore-from-files/destination');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const open = page.getByRole('button', { name: 'Set target URL', exact: true });
  await open.click();
  await expect(page.locator('#targetUrl')).toHaveValue('');
  await page.locator('#targetUrl').fill('file:///cancelled');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await open.click();
  await expect(page.locator('#targetUrl')).toHaveValue('');
  const url = 'file:///archive?custom=a%2Bb&other=a%26b';
  await page.locator('#targetUrl').fill(url);
  await page.getByRole('button', { name: 'Override target URL', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip test and continue', exact: true }).click();
  await expect(page).toHaveURL('/restore-from-files/encryption');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => creates.length).toBe(1);
  expect(creates[0].request().postDataJSON().Backup.TargetURL).toBe(url);
});
