import { expect, test, type Route } from '@playwright/test';

const translations = {
  '2772023564304193657': 'Translated password placeholder',
  '2676308716533799662': 'Translated login {$START_TAG_SH_ICON}arrow-right{$CLOSE_TAG_SH_ICON}',
};

for (const locale of ['zh-Hant', 'zh-TW']) {
  test(`waits for ${locale} translations on navigation and reload`, async ({ page }) => {
    const requests: Route[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((value) => localStorage.setItem('v1:duplicati:locale', value), locale);
    const fileLocale = locale === 'zh-TW' ? 'zh_TW' : locale;
    await page.route(`**/locale/messages.${fileLocale}.json`, (route) => {
      requests.push(route);
    });

    for (let navigation = 0; navigation < 2; navigation++) {
      if (navigation === 0) await page.goto('/login');
      else await page.reload();
      await expect.poll(() => requests.length).toBe(navigation + 1);
      // Simulate a slow translation response while cached scripts and lazy routes load.
      // The delay exercises startup ordering, rather than waiting for a UI element.
      await page.waitForTimeout(1000);
      await expect(page.getByRole('button', { name: 'Login', exact: true })).toHaveCount(0);
      await requests[navigation].fulfill({ status: 200, json: { translations } });
      await expect(page.getByPlaceholder('Translated password placeholder')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Translated login', exact: true })).toBeVisible();
      await expect(page.getByPlaceholder('Enter your password')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

for (const failure of ['http', 'json', 'network']) {
  test(`starts in English if the translation request fails (${failure})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('v1:duplicati:locale', 'zh-Hant'));
    await page.route('**/locale/messages.zh-Hant.json', async (route) => {
      if (failure === 'network') await route.abort();
      else if (failure === 'http') await route.fulfill({ status: 404, body: 'Not found' });
      else await route.fulfill({ status: 200, contentType: 'application/json', body: 'invalid json' });
    });
    await page.goto('/login');
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
