import { expect, test } from './fixtures/authenticated';
import type { Locator, Page } from '@playwright/test';

async function ring(element: Locator) {
  await expect(element).toBeFocused();
  const style = await element.evaluate((el) => {
    // Ship fields paint focus on their visible wrapper rather than the input.
    const candidates = [el, el.closest('.input-wrap'), el.closest('sh-checkbox, sh-toggle, sh-radio')].filter(
      (node): node is Element => node !== null
    );
    const indicators = candidates.map((node) => {
      const css = getComputedStyle(node);
      return {
        width: parseFloat(css.outlineWidth),
        style: css.outlineStyle,
        color: css.outlineColor,
        offset: parseFloat(css.outlineOffset),
      };
    });
    return {
      visible: el.matches(':focus-visible'),
      treeItem: el.getAttribute('role') === 'treeitem',
      elementWidth: el.getBoundingClientRect().width,
      elementHeight: el.getBoundingClientRect().height,
      ...(indicators.find((css) => css.style === 'solid' && css.width >= 2) ?? indicators[0]),
    };
  });
  expect(style.visible).toBe(true);
  expect(style.width).toBeGreaterThanOrEqual(2);
  expect(style.style).toBe('solid');
  expect(style.color).not.toBe('rgba(0, 0, 0, 0)');
  if (style.treeItem && style.offset === -2) {
    // Tree rows keep the main branch's 2px inset outline inside their clipped container.
    expect(style.elementWidth).toBeGreaterThan(style.width * 2);
    expect(style.elementHeight).toBeGreaterThan(style.width * 2);
  } else {
    expect(style.offset).toBeGreaterThanOrEqual(2);
  }
}
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
for (const theme of ['light', 'dark']) {
  test('home actions have one visible keyboard stop in ' + theme, async ({ authenticatedPage: page }) => {
    await page.evaluate((theme) => {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(theme);
    }, theme);
    const card = page.locator('app-home header sh-card').first();
    await card.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await ring(card);
    await page.keyboard.press('Tab');
    await ring(page.locator('app-home header sh-card').nth(1));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp('/restore$'));
  });

  test('all five editor steps can be reached by keyboard in ' + theme, async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/backup/42', (route) =>
      route.fulfill({
        json: {
          Backup: {
            ID: '42',
            Name: 'Keyboard backup',
            Sources: [],
            Settings: [{ Name: '--no-encryption', Value: 'True' }],
            TargetURL: 'file:///backup',
            Filters: [],
            Metadata: {},
            OperationType: 'Backup',
          },
          Schedule: null,
        },
      })
    );
    await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v1/filesystem*', (route) => route.fulfill({ json: [] }));
    await navigate(page, '/backup/42/general');
    await expect(page.getByPlaceholder('Your backup name')).toBeVisible();
    await page.evaluate((theme) => {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(theme);
    }, theme);
    expect(
      await page
        .locator('[tabindex]')
        .evaluateAll((els) => els.filter((el) => Number(el.getAttribute('tabindex')) > 0).length)
    ).toBe(0);
    const steps = page.locator('app-backup .backup-stepper a');
    await steps.first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await ring(steps.first());
    for (const [index, path] of ['general', 'source-data', 'destination', 'schedule', 'options'].entries()) {
      if (index) await page.keyboard.press('Tab');
      await ring(steps.nth(index));
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp('/backup/42/' + path + '$'));
      for (let tab = 0; tab < 8; tab++) {
        await page.keyboard.press('Tab');
        const focused = page.locator(':focus');
        if ((await focused.count()) && (await focused.evaluate((el) => el.tagName !== 'BODY' && el.tagName !== 'HTML')))
          await ring(focused);
      }
      await steps.nth(index).focus();
    }
  });
}

test('login controls follow DOM order and expose the password toggle by keyboard', async ({ page, serverApi }) => {
  void serverApi;
  await page.goto('/login');
  const password = page.getByPlaceholder('Enter your password');
  await expect(password).toBeVisible();
  await password.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await ring(password);
  await page.keyboard.press('Tab');
  const toggle = page.getByRole('button', { name: 'Toggle password visibility', exact: true });
  await expect(toggle).toBeFocused();
  await ring(toggle);
  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'password');
  await page.keyboard.press('Tab');
  await ring(page.getByRole('button', { name: 'Login', exact: true }));
});

test.describe('populated home toolbar', () => {
  test.use({
    initialBackups: [
      [
        {
          Backup: {
            ID: '42',
            Name: 'Documents',
            ExternalID: null,
            Description: '',
            Tags: [],
            TargetURL: 'file:///backup',
            DBPath: '/data/backup.sqlite',
            DBPathExists: true,
            Sources: ['/source'],
            Settings: [],
            Filters: [],
            Metadata: { BackupListCount: '2' },
            IsTemporary: false,
            IsUnencryptedOrPassphraseStored: true,
            AdditionalTargetURLs: [],
          },
          Schedule: null,
        },
      ],
      { scope: 'test' },
    ],
  });
  for (const theme of ['light', 'dark']) {
    test('list and details controls keep visible focus in ' + theme, async ({ authenticatedPage: page }) => {
      await page.evaluate((theme) => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
      }, theme);
      const list = page.getByRole('button', { name: 'List', exact: true });
      const details = page.getByRole('button', { name: 'Details', exact: true });
      await list.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await ring(list);
      await page.keyboard.press('ArrowRight');
      await ring(details);
      await expect(details).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('ArrowLeft');
      await ring(list);
      await expect(list).toHaveAttribute('aria-pressed', 'true');
    });
  }
});

test('keyboard focus remains visible with forced colors', async ({ authenticatedPage: page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const card = page.locator('app-home header sh-card').first();
  await card.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await ring(card);
});
