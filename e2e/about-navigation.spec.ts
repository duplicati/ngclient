import { expect, test } from './fixtures/authenticated';

test('keeps About selection and Space/Enter navigation', async ({ authenticatedPage: page }) => {
  await page.evaluate(() => {
    history.pushState(null, '', '/about/system-info');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const tabs = page.locator('app-about sh-tabs');
  const info = tabs.getByRole('tab', { name: 'System info', exact: true });
  const settings = tabs.getByRole('tab', { name: 'Server settings', exact: true });
  await expect(info).toHaveCSS('padding', '1px 6px');
  await expect(info).toHaveCSS('height', '48px');
  await expect(info).toHaveAttribute('aria-selected', 'true');
  await expect(info).toHaveAttribute('tabindex', '0');
  await expect(settings).toHaveAttribute('tabindex', '-1');
  await info.focus();
  await info.press('ArrowRight');
  await expect(page).toHaveURL('/about/server-settings');
  await expect(settings).toBeFocused();
  await expect(settings).toHaveCSS('outline-style', 'solid');
  await settings.press('ArrowLeft');
  await expect(page).toHaveURL('/about/system-info');
  await expect(info).toBeFocused();
  await settings.focus();
  await settings.press('Space');
  await expect(page).toHaveURL('/about/server-settings');
  await expect(settings).toHaveAttribute('aria-selected', 'true');
  await info.focus();
  await info.press('Enter');
  await expect(page).toHaveURL('/about/system-info');
  await page.goBack();
  await expect(page).toHaveURL('/about/server-settings');
  await expect(settings).toHaveAttribute('aria-selected', 'true');
});

for (const button of ['ControlOrMeta', 'middle'] as const) {
  test(`opens About page in a separate tab with ${button}`, async ({ authenticatedPage: page }) => {
    await page.context().route('**/about/server-settings', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Opened About target</title>',
      })
    );
    await page.evaluate(() => {
      history.pushState(null, '', '/about/system-info');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const target = page.locator('app-about sh-tabs').getByRole('tab', { name: 'Server settings', exact: true });
    await expect(target).toHaveAttribute('href', '/about/server-settings');
    const popupPromise = page.context().waitForEvent('page');
    if (button === 'middle') await target.click({ button: 'middle' });
    else await target.click({ modifiers: [button] });
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/\/about\/server-settings$/);
    await expect(popup).toHaveTitle('Opened About target');
    await expect(page).toHaveURL('/about/system-info');
    await expect(
      page.locator('app-about sh-tabs').getByRole('tab', { name: 'System info', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await popup.close();
  });
}
