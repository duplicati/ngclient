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
      expect(serverApi.uiSettings).not.toHaveProperty('theme');
      expect(serverApi.requests.filter((request) => request.method() === 'PATCH')).toHaveLength(0);

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

for (const serverDark of [false, true]) {
  test.describe(`server preference ${serverDark ? 'dark' : 'light'}`, () => {
    test.beforeEach(async ({ page, serverApi }) => {
      serverApi.uiSettings.theme = serverDark ? 'dark' : 'light';
      await page.addInitScript(({ key, dark }) => localStorage.setItem(key, JSON.stringify(dark)), {
        key: preferenceKey,
        dark: !serverDark,
      });
    });

    test('keeps an explicit browser preference ahead of the server default', async ({
      authenticatedPage: page,
      serverApi,
    }) => {
      await expect(page.locator('html')).toHaveClass(serverDark ? /\blight\b/ : /\bdark\b/);
      expect(serverApi.requests.some((request) => request.method() === 'PATCH')).toBe(false);
      expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe(JSON.stringify(!serverDark));
    });
  });
}

test.describe('server theme defaults', () => {
  test.beforeEach(async ({ serverApi }) => {
    serverApi.uiSettings.theme = 'dark';
  });

  test('a fresh browser inherits the default without persisting it as a personal choice', async ({
    authenticatedPage: page,
    serverApi,
  }) => {
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
    await page.locator('app-layout [sidenav] header button').click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(serverApi.uiSettings.theme).toBe('dark');
    expect(serverApi.requests.filter((r) => r.method() === 'PATCH')).toHaveLength(0);
  });

  test('settings separates the browser override from the server default', async ({
    authenticatedPage: page,
    serverApi,
  }) => {
    await page.evaluate(() => {
      history.pushState(null, '', '/settings');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const defaults = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Default theme for this server', exact: true }) });
    await defaults.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(defaults.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(serverApi.uiSettings.theme).toBe('light');
    await page.locator('app-layout [sidenav] header button').click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await defaults.getByRole('button', { name: 'Operating system', exact: true }).click();
    await expect(defaults.getByRole('button', { name: 'Operating system', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.getByRole('button', { name: 'Use server default', exact: true }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
    await expect(page.getByRole('button', { name: 'Use server default', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
