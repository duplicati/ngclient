import { type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

test('cancels the global pause dialog without pausing the server', async ({ authenticatedPage: page }) => {
  const pauses: Route[] = [];
  await page.route('**/api/v1/serverstate/pause*', (route) => {
    pauses.push(route);
    return route.fulfill({ json: {} });
  });
  const status = page.locator('app-status-bar');
  await status.getByRole('button', { name: 'Pause', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Pause settings' })).toBeVisible();
  await dialog.locator('sh-radio').filter({ hasText: '15 minutes' }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect(status.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(pauses).toHaveLength(0);
});

test('pauses transfers for the selected duration and resumes from the status bar', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const pauses: Route[] = [];
  const resumes: Route[] = [];
  await page.route('**/api/v1/serverstate/pause*', (route) => {
    pauses.push(route);
  });
  await page.route('**/api/v1/serverstate/resume', (route) => {
    resumes.push(route);
  });

  const status = page.locator('app-status-bar');
  const pause = status.getByRole('button', { name: 'Pause', exact: true });
  const resume = status.getByRole('button', { name: 'Resume', exact: true });
  await pause.click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('sh-radio').filter({ hasText: '15 minutes' }).click();
  await dialog.locator('sh-checkbox').filter({ hasText: 'Also pause transfers' }).click();
  await dialog.getByRole('button', { name: 'Update settings', exact: true }).click();

  await expect.poll(() => pauses.length).toBe(1);
  const request = pauses[0].request();
  expect(request.method()).toBe('POST');
  expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual({
    duration: '15m',
    pauseTransfers: 'true',
  });
  await expect(dialog).toBeVisible();
  await pauses[0].fulfill({ json: {} });
  await expect(dialog).toHaveCount(0);

  serverApi.sendServerStatus({ ProgramState: 'Paused' });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect.poll(() => resumes.length).toBe(1);
  expect(resumes[0].request().method()).toBe('POST');
  await resumes[0].fulfill({ json: {} });

  serverApi.sendServerStatus({ ProgramState: 'Running' });
  await expect(pause).toBeVisible();
  expect(serverApi.pageErrors).toEqual([]);
});
