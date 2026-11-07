import { expect, test } from './fixtures/authenticated';

const preferenceKey = 'v1:persist:duplicati:darkTheme';
const switchToLight = 'Switch to light mode';
const switchToDark = 'Switch to dark mode';

for (const initialDark of [false, true]) {
  test.describe(`theme control starting in ${initialDark ? 'dark' : 'light'} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        ({ key, dark }) => {
          // Seed a fresh browser only; a reload must retain the user's changed preference.
          if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(dark));
        },
        { key: preferenceKey, dark: initialDark }
      );
    });

    test('explains the next action, supports keyboard activation and retains the selected theme after reload', async ({
      authenticatedPage: page,
      serverApi,
    }) => {
      const toggle = page.locator('app-layout [sidenav] header button');
      const originalAction = initialDark ? switchToLight : switchToDark;
      const changedAction = initialDark ? switchToDark : switchToLight;
      await expect(page.locator('html')).toHaveClass(initialDark ? /\bdark\b/ : /\blight\b/);
      await expect(toggle).toHaveAccessibleName(originalAction);
      await toggle.hover();
      await expect(page.getByRole('tooltip')).toHaveText(originalAction);
      await page.getByRole('heading', { name: 'My backups', exact: true }).hover();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await toggle.focus();
      await page.keyboard.press(initialDark ? 'Space' : 'Enter');
      await expect(page.locator('html')).toHaveClass(initialDark ? /\blight\b/ : /\bdark\b/);
      await expect(toggle).toHaveAccessibleName(changedAction);
      await expect(toggle.locator('sh-icon')).toHaveText(initialDark ? 'moon' : 'sun');
      await toggle.hover();
      await expect(page.getByRole('tooltip')).toHaveText(changedAction);
      expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe(JSON.stringify(!initialDark));

      await page.reload();
      await expect.poll(() => serverApi.refreshRequests.length).toBe(1);
      await serverApi.refreshRequests[0].fulfill({
        json: { AccessToken: 'theme-refreshed-token', RefreshNonce: 'theme-refreshed-nonce' },
      });
      await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveClass(initialDark ? /\blight\b/ : /\bdark\b/);
      await expect(toggle).toHaveAccessibleName(changedAction);
      await toggle.hover();
      await expect(page.getByRole('tooltip')).toHaveText(changedAction);
      await toggle.click();
      await expect(page.locator('html')).toHaveClass(initialDark ? /\bdark\b/ : /\blight\b/);
      await expect(toggle).toHaveAccessibleName(originalAction);
      await expect(page.getByRole('tooltip')).toHaveText(originalAction);
      expect(serverApi.loginRequests).toHaveLength(1);
    });
  });
}
