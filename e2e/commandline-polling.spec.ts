import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

async function openOutput(page: Page) {
  await page.clock.install();
  const requests: Route[] = [];
  await page.route('**/api/v1/commandline/run-test?*', (route) => {
    requests.push(route);
  });
  await page.route('**/api/v1/commandline/run-test/abort', (route) => route.fulfill({ json: {} }));
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/commandline/run-test');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const component = page.locator('app-commandline-result');
  await expect(component).toBeVisible();
  return { component, requests };
}

test('slow command output is requested once and subsequent pages use the advanced offset', async ({
  authenticatedPage: page,
}) => {
  const { component, requests } = await openOutput(page);
  await page.clock.runFor(3100);
  await expect.poll(() => requests.length).toBe(1);
  await requests[0].fulfill({
    json: { Started: true, Finished: false, Count: 2, Offset: 0, Pagesize: 100, Items: ['first'] },
  });
  await expect(component.locator('code')).toContainText('first');
  await page.clock.runFor(1000);
  await expect.poll(() => requests.length).toBe(2);
  expect(new URL(requests[1].request().url()).searchParams.get('offset')).toBe('1');
  await requests[1].fulfill({
    json: { Started: true, Finished: true, Count: 2, Offset: 1, Pagesize: 100, Items: ['second'] },
  });
  await expect(component.locator('section > .status')).toContainText('Finished!');
  await expect(component.locator('code')).toContainText('second');
  expect((await component.locator('code').textContent())?.match(/first/g)).toHaveLength(1);
  await page.clock.runFor(5000);
  expect(requests).toHaveLength(2);
});

test('a late poll cannot restore started status or output after abort succeeds', async ({
  authenticatedPage: page,
}) => {
  const { component, requests } = await openOutput(page);
  await page.clock.runFor(1100);
  await expect.poll(() => requests.length).toBe(1);
  await component.getByRole('button', { name: 'Abort', exact: true }).click();
  await expect(component.locator('section > .status')).toContainText('Aborted!');
  const received = page.waitForResponse(
    (response) => response.request().method() === 'GET' && response.url().includes('/commandline/run-test?')
  );
  await requests[0].fulfill({
    json: { Started: true, Finished: false, Count: 1, Offset: 0, Pagesize: 100, Items: ['late output'] },
  });
  await received;
  await page.clock.runFor(3000);
  await expect(component.locator('section > .status')).toContainText('Aborted!');
  await expect(component.locator('code')).not.toContainText('late output');
  expect(requests).toHaveLength(1);
});
