import { expect, test } from './fixtures/authenticated';

const desktop = 'app-status-bar .desktop-actions app-remote-connectivity-status';

test('uses a styled native link, keyboard navigation and browser history', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const status = page.locator(desktop);
  const link = status.getByRole('link', { name: 'Click to register', exact: true });
  await expect(link).toHaveAttribute('href', '/connect/logon');
  await expect(link).toHaveCSS('text-decoration-line', 'none');
  await expect(link).not.toHaveAttribute('appKeyboardAction');
  await test.info().attach('desktop-status', { body: await status.screenshot(), contentType: 'image/png' });
  const document = await page.locator('html').elementHandle();
  await link.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(link).toBeFocused();
  await expect(link).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/connect/logon');
  await expect(page.locator('app-connect')).toBeVisible();
  expect(await document!.evaluate((element) => element.isConnected)).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL('/');
  await page.locator(desktop).getByRole('link', { name: 'Click to register', exact: true }).click();
  await expect(page).toHaveURL('/connect/logon');
  await page.goBack();
  await expect(page).toHaveURL('/');
  await page.goForward();
  await expect(page).toHaveURL('/connect/logon');
  expect(serverApi.refreshRequests).toHaveLength(0);
});

test('keeps the registering status linked to the existing connection screen', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  await expect.poll(() => serverApi.subscriptions).toContain('remotecontrol');
  serverApi.sendRemoteControlStatus({ IsRegistering: true, CanEnable: false, RegistrationUrl: null });
  const status = page.locator(desktop);
  const link = status.getByRole('link', { name: 'Connecting', exact: true });
  await expect(link).toHaveAttribute('href', '/connect/logon');
  await expect(link.locator('.status')).toHaveClass(/warning/);
  await expect(link.locator('.status')).toHaveClass(/blinking/);
  await link.click();
  await expect(page).toHaveURL('/connect/logon');
  await expect(page.getByText('Connecting to console', { exact: true })).toBeVisible();
});
for (const activation of ['ControlOrMeta', 'middle'] as const) {
  test(`supports ${activation} opening the registration screen in another tab`, async ({
    authenticatedPage: page,
    context,
  }) => {
    // Verify native link handling; the target document deliberately does not run the app/auth flow.
    await context.route('**/connect/logon', (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({ contentType: 'text/html', body: '<title>Registration navigation target</title>' })
        : route.continue()
    );
    const popupPromise = context.waitForEvent('page');
    const link = page.locator(desktop).getByRole('link', { name: 'Click to register', exact: true });
    if (activation === 'middle') await link.click({ button: 'middle' });
    else await link.click({ modifiers: [activation] });
    const popup = await popupPromise;
    await expect(popup).toHaveURL('/connect/logon');
    await expect(popup).toHaveTitle('Registration navigation target');
    await expect(page).toHaveURL('/');
    await popup.close();
  });
}

test('keeps the mobile trigger non-interactive inside and opens the registration link from its menu', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const more = page.getByRole('button', { name: 'More options', exact: true });
  await expect(more).toBeVisible();
  await expect(more.locator('app-remote-connectivity-status .status')).toHaveCount(1);
  await expect(more.locator('a, button, [tabindex], [role="link"], [appKeyboardAction]')).toHaveCount(0);
  await more.focus();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL('/');
  const link = page.getByRole('link', { name: 'Click to register', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/connect/logon');
  await test.info().attach('mobile-menu', { body: await page.screenshot(), contentType: 'image/png' });
  await link.click();
  await expect(page).toHaveURL('/connect/logon');
  await expect(page.locator('app-connect')).toBeVisible();
});
