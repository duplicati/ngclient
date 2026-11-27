import { expect, test } from './fixtures/authenticated';

test('changes the locale only when a language is selected', async ({ authenticatedPage: page }) => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const select = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Language', exact: true }) })
    .locator('sh-select');
  const input = select.locator('input');
  await expect(input).toHaveValue('en');
  await select.click();
  await input.fill('da');
  const danish = page.getByRole('option', { name: 'Danish (da)', exact: true });
  await expect(danish).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('v1:duplicati:locale'))).toBe('en-US');

  // The authenticated fixture resets the locale on each document load.
  await page.evaluate(() => {
    window.addEventListener(
      'pagehide',
      () => {
        sessionStorage.setItem('locale-before-reload', localStorage.getItem('v1:duplicati:locale') ?? '');
      },
      { once: true }
    );
  });
  const reloaded = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
  await danish.click();
  await reloaded;
  expect(await page.evaluate(() => sessionStorage.getItem('locale-before-reload'))).toBe('da');
});
