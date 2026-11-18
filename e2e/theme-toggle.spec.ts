import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const preferenceKey = 'v1:persist:duplicati:darkTheme';
async function chooseTheme(page: Page, name: string) {
  await page.getByRole('button', { name: /^Theme: / }).click();
  await themeOption(page, name).click();
}

function themeOption(page: Page, name: string) {
  return page.locator('app-layout [sidenav] header').getByRole('listbox').getByRole('button', { name });
}

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

    test('shows the current mode, supports keyboard selection and retains the selected theme after reload', async ({
      authenticatedPage: page,
      serverApi,
    }) => {
      const trigger = page.getByRole('button', { name: /^Theme: / });
      const original = initialDark ? 'Dark' : 'Light';
      const changed = initialDark ? 'Light' : 'Dark';
      await expect(page.locator('html')).toHaveClass(initialDark ? /\bdark\b/ : /\blight\b/);
      await expect(trigger).toHaveAccessibleName(`Theme: ${original}`);
      await expect(trigger.locator('sh-icon')).toHaveText(initialDark ? 'moon' : 'sun');
      await trigger.hover();
      await expect(page.getByRole('tooltip')).toHaveText(`Theme: ${original}`);
      await page.getByRole('heading', { name: 'My backups', exact: true }).hover();
      await expect(page.getByRole('tooltip')).toHaveCount(0);

      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(themeOption(page, '')).toHaveCount(4);
      await expect(themeOption(page, original)).toHaveAttribute('aria-current', 'true');
      // The menu owns arrow-key navigation: Light is the first option, Dark the second.
      for (let i = 0; i < (initialDark ? 1 : 2); i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.locator('html')).toHaveClass(initialDark ? /\blight\b/ : /\bdark\b/);
      await expect(trigger).toHaveAccessibleName(`Theme: ${changed}`);
      await expect(trigger.locator('sh-icon')).toHaveText(initialDark ? 'sun' : 'moon');
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
      await expect(trigger).toHaveAccessibleName(`Theme: ${changed}`);
      await chooseTheme(page, original);
      await expect(page.locator('html')).toHaveClass(initialDark ? /\bdark\b/ : /\blight\b/);
      await expect(trigger).toHaveAccessibleName(`Theme: ${original}`);
      expect(serverApi.loginRequests).toHaveLength(1);
    });
  });
}

test.describe('operating system and server default modes', () => {
  test.beforeEach(async ({ page, serverApi }) => {
    serverApi.uiSettings.theme = 'dark';
    await page.emulateMedia({ colorScheme: 'light' });
  });

  test('the operating system choice overrides the server default and tracks the OS live', async ({
    authenticatedPage: page,
    serverApi,
  }) => {
    const trigger = page.getByRole('button', { name: /^Theme: / });
    await expect(trigger).toHaveAccessibleName('Theme: Default');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await chooseTheme(page, 'Operating system');
    await expect(trigger).toHaveAccessibleName('Theme: Operating system');
    await expect(trigger.locator('sh-icon')).toHaveText('desktop');
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe('"system"');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveClass(/\blight\b/);

    await chooseTheme(page, 'Default');
    await expect(trigger).toHaveAccessibleName('Theme: Default');
    await expect(trigger.locator('sh-icon')).toHaveText('hard-drives');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
    expect(serverApi.uiSettings.theme).toBe('dark');
    expect(serverApi.requests.filter((request) => request.method() === 'PATCH')).toHaveLength(0);
  });
});

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
    await chooseTheme(page, 'Light');
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
      .filter({ has: page.getByRole('heading', { name: 'Default theme', exact: true }) });
    const chooseDefault = async (name: string) => {
      await defaults.locator('sh-select').click();
      await page.locator('li.option').filter({ hasText: name }).click();
    };
    await expect(defaults.locator('sh-select input')).toHaveValue('dark');
    await chooseDefault('Light');
    await expect(defaults.locator('sh-select input')).toHaveValue('light');
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(serverApi.uiSettings.theme).toBe('light');
    await chooseTheme(page, 'Dark');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await chooseDefault('Operating system');
    await expect(defaults.locator('sh-select input')).toHaveValue('system');
    await expect.poll(() => serverApi.uiSettings.theme).toBe('system');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    const personal = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Color theme', exact: true }) });
    await personal.getByRole('button', { name: 'Default', exact: true }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
    await expect(personal.getByRole('button', { name: 'Default', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await personal.getByRole('button', { name: 'Operating system', exact: true }).click();
    await expect(personal.getByRole('button', { name: 'Operating system', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe('"system"');
    await expect(page.getByRole('button', { name: /^Theme: / })).toHaveAccessibleName('Theme: Operating system');
  });
});
