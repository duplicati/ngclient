import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

test.use({
  initialBackups: [
    [
      {
        Backup: {
          ID: '42',
          Name: 'Documents',
          Description: '',
          Sources: ['/source'],
          Settings: [],
          Metadata: {},
          OperationType: 'Backup',
          DBPathExists: true,
          IsUnencryptedOrPassphraseStored: true,
          TargetURL: 'file:///backup',
        },
        Schedule: null,
      },
    ],
    { scope: 'test' },
  ],
});

async function openExport(page: Page, retainPasswords = false) {
  const tokens: Route[] = [];
  const exports: URL[] = [];
  await page.route('**/api/v1/auth/issuetoken/export', (route) => {
    tokens.push(route);
  });
  await page.route('**/api/v1/backup/42/export?*', (route) => {
    exports.push(new URL(route.request().url()));
    return route.fulfill({ contentType: 'application/octet-stream', body: '{"Backup":{"Name":"Documents"}}' });
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/export');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('app-export')).toBeVisible();
  const form = page.locator('app-export');
  if (!retainPasswords) await form.locator('input[formcontrolname=exportPasswords]').uncheck();
  const encrypt = form.locator('input[formcontrolname=encryption]');
  return { form, encrypt, tokens, exports, submit: form.getByRole('button', { name: 'Export', exact: true }) };
}

async function enterPassword(page: Page) {
  await page.locator('input[formcontrolname=encryption]').check();
  await page.getByPlaceholder('Password', { exact: true }).fill('selected export secret');
  await page.getByPlaceholder('Repeat password', { exact: true }).fill('selected export secret');
}

test('turning export encryption off omits the retained password and downloads JSON', async ({
  authenticatedPage: page,
}) => {
  const { encrypt, tokens, exports, submit } = await openExport(page);
  await enterPassword(page);
  await encrypt.uncheck();
  await submit.click();
  await expect.poll(() => tokens.length).toBe(1);
  const downloaded = page.waitForEvent('download');
  await tokens[0].fulfill({ json: { Token: 'export-token' } });
  const download = await downloaded;
  expect(exports).toHaveLength(1);
  expect(exports[0].searchParams.has('passphrase')).toBe(false);
  expect(exports[0].searchParams.get('export-passwords')).toBe('false');
  expect(download.suggestedFilename()).toBe('Documents-duplicati-config.json');
});

for (const encrypted of [false, true]) {
  test(`file export retains its selected encrypted=${encrypted} options while obtaining a token`, async ({
    authenticatedPage: page,
  }) => {
    const { form, encrypt, tokens, exports, submit } = await openExport(page);
    if (encrypted) await enterPassword(page);
    await submit.click();
    await expect.poll(() => tokens.length).toBe(1);
    if (encrypted) await encrypt.uncheck();
    else await enterPassword(page);
    await form.locator('input[formcontrolname=exportPasswords]').check();
    const downloaded = page.waitForEvent('download');
    await tokens[0].fulfill({ json: { Token: 'export-token' } });
    const download = await downloaded;
    expect(exports).toHaveLength(1);
    expect(exports[0].searchParams.get('passphrase')).toBe(encrypted ? 'selected export secret' : null);
    expect(exports[0].searchParams.get('export-passwords')).toBe('false');
    expect(download.suggestedFilename()).toBe(`Documents-duplicati-config.${encrypted ? 'aes' : 'json'}`);
  });
}

test('initial plaintext password export asks for approval and supports cancellation', async ({
  authenticatedPage: page,
}) => {
  const { tokens, exports, submit } = await openExport(page, true);
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Export without encryption?', exact: true })).toBeVisible();
  expect(tokens).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(tokens).toHaveLength(0);
  await submit.click();
  await page.getByRole('button', { name: 'Yes, write plain-text passwords', exact: true }).click();
  await expect.poll(() => tokens.length).toBe(1);
  const downloaded = page.waitForEvent('download');
  await tokens[0].fulfill({ json: { Token: 'export-token' } });
  const download = await downloaded;
  expect(exports[0].searchParams.get('export-passwords')).toBe('true');
  expect(exports[0].searchParams.has('passphrase')).toBe(false);
  expect(download.suggestedFilename()).toBe('Documents-duplicati-config.json');
});
