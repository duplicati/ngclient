import { expect, test } from './fixtures/authenticated';

const destinations = [
  ['Home', '/'],
  ['Add backup', '/add-backup'],
  ['Restore', '/restore'],
  ['Destinations', '/destinations'],
  ['System status', '/status'],
  ['Settings', '/settings'],
  ['About Duplicati', '/about'],
] as const;

test('exposes sidebar destinations as links and keeps commands as buttons', async ({ authenticatedPage: page }) => {
  const sidebar = page.locator('app-layout [sidenav]');
  for (const [name, href] of destinations) {
    await expect(sidebar.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    await expect(sidebar.getByRole('link', { name, exact: true })).toHaveCSS('text-decoration-line', 'none');
  }
  await expect(sidebar.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
  await test.info().attach('sidebar', { body: await sidebar.screenshot(), contentType: 'image/png' });
  await expect(sidebar.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  await expect(sidebar.locator('header button')).toHaveCount(1);
  await expect(sidebar.getByRole('link', { name: 'Documentation', exact: true })).toHaveAttribute('target', '_blank');
});

test('supports Tab and Enter, SPA navigation and browser back/forward', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const sidebar = page.locator('app-layout [sidenav]');
  const home = sidebar.getByRole('link', { name: 'Home', exact: true });
  const add = sidebar.getByRole('link', { name: 'Add backup', exact: true });
  // Retaining this DOM node proves that routing did not reload the document.
  const document = await page.locator('html').elementHandle();
  await home.focus();
  await page.keyboard.press('Tab');
  await expect(add).toBeFocused();
  await expect(add).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/add-backup');
  await expect(page.getByRole('heading', { name: 'Add a new backup', exact: true })).toBeVisible();
  await expect(add).toHaveAttribute('aria-current', 'page');
  await expect(home).not.toHaveAttribute('aria-current');
  expect(await document!.evaluate((element) => element.isConnected)).toBe(true);
  await home.click();
  await expect(page).toHaveURL('/');
  await page.goBack();
  await expect(page).toHaveURL('/add-backup');
  await page.goForward();
  await expect(page).toHaveURL('/');
  expect(await document!.evaluate((element) => element.isConnected)).toBe(true);
  expect(serverApi.loginRequests).toHaveLength(1);
  expect(serverApi.refreshRequests).toHaveLength(0);
});

for (const activation of ['ControlOrMeta', 'middle'] as const) {
  test(`supports ${activation} opening a destination in a separate tab`, async ({
    authenticatedPage: page,
    context,
  }) => {
    // Probe native link handling only. Authentication in the new tab is a separate concern.
    // Serve a static destination document so this test never contacts a real API.
    await context.route('**/add-backup', async (route) => {
      if (route.request().isNavigationRequest()) {
        await route.fulfill({ contentType: 'text/html', body: '<title>Navigation target</title>' });
      } else {
        await route.continue();
      }
    });
    const popupPromise = context.waitForEvent('page');
    const link = page.locator('app-layout [sidenav]').getByRole('link', { name: 'Add backup', exact: true });
    if (activation === 'middle') await link.click({ button: 'middle' });
    else await link.click({ modifiers: [activation] });
    const popup = await popupPromise;
    await expect(popup).toHaveURL('/add-backup');
    await expect(popup).toHaveTitle('Navigation target');
    await expect(page).toHaveURL('/');
    await popup.close();
  });
}

test('retains sidebar navigation on a narrow screen', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('app-mobile-menu-toggle button').click();
  const add = page.locator('app-layout [sidenav]').getByRole('link', { name: 'Add backup', exact: true });
  await expect(add).toBeInViewport();
  await add.click();
  await expect(page).toHaveURL('/add-backup');
  await expect(page.getByRole('heading', { name: 'Add a new backup', exact: true })).toBeVisible();
});
