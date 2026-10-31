import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

test.use({ initialServerSettings: { '--retry-delay': '5s', '--removed': 'old' } });

async function openAdvancedSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL('/settings');
  const editor = page.locator('app-advanced-options-settings');
  await editor.scrollIntoViewIfNeeded();
  const rows = editor.locator('app-options-list .field-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole('textbox').nth(0)).toHaveValue('--retry-delay');
  const text = rows.nth(0).getByRole('textbox').nth(1);
  await text.fill('10s');
  await rows.nth(1).locator('button.remove-btn').click();
  return { editor, text, save: editor.getByRole('button', { name: 'Save settings', exact: true }) };
}

test('advanced settings save is single-flight and preserves removal semantics', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const { editor, save } = await openAdvancedSettings(page);
  await save.click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
  await expect(save).toBeDisabled();
  await expect(editor.locator('.options-editor')).toHaveAttribute('aria-busy', 'true');
  await expect(editor.locator('.options-editor')).toHaveAttribute('inert', '');
  await expect(editor.getByRole('status')).toContainText('Saving advanced settings');
  await page.keyboard.press('Enter');
  expect(serverApi.settingsRequests).toHaveLength(1);
  expect(serverApi.settingsRequests[0].request().postDataJSON()).toEqual({ '--retry-delay': '10s', '--removed': null });
  await serverApi.settingsRequests[0].fulfill({ json: {} });
  await expect(editor.getByText('Settings saved', { exact: true })).toBeVisible();
  await expect(save).toBeEnabled();
});

test('advanced settings retain edited values after failure and retry the latest value', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  const { editor, text, save } = await openAdvancedSettings(page);
  await save.click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
  await serverApi.settingsRequests[0].fulfill({ status: 500, json: { Error: 'Save failed' } });
  await expect(editor.getByRole('alert')).toContainText('Could not save advanced settings');
  await expect(editor.getByText('Settings saved', { exact: true })).toHaveCount(0);
  await expect(text).toHaveValue('10s');
  await text.fill('20s');
  await text.blur();
  await save.click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(2);
  expect(serverApi.settingsRequests[1].request().postDataJSON()).toEqual({ '--retry-delay': '20s', '--removed': null });
  await expect(editor.getByRole('alert')).toHaveCount(0);
  await serverApi.settingsRequests[1].fulfill({ json: {} });
  await expect(editor.getByText('Settings saved', { exact: true })).toBeVisible();
});

test('a late advanced settings failure cannot affect the next page', async ({ authenticatedPage: page, serverApi }) => {
  const { save } = await openAdvancedSettings(page);
  await save.click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
  await page.evaluate(() => {
    history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  const completed = page.waitForResponse(
    (response) => response.url().includes('/api/v1/serversettings') && response.request().method() === 'PATCH'
  );
  await serverApi.settingsRequests[0].fulfill({ status: 500, json: { Error: 'Late failure' } });
  await completed;
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Settings saved', { exact: true })).toHaveCount(0);
});
