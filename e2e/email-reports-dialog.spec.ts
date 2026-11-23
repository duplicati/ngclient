import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

test.use({ initialServerSettings: { '--send-mail-to': 'old@example.com' } });

async function openEmailDialog(page: Page) {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const editor = page.locator('app-advanced-options-settings');
  await editor.scrollIntoViewIfNeeded();
  await editor.getByRole('button', { name: 'More advanced option actions' }).click();
  await page.getByRole('button', { name: 'Edit email reports' }).click();

  const dialog = page.locator('app-email-reports-dialog');
  await expect(dialog.getByRole('heading', { name: 'Configure email reports' })).toBeVisible();
  return { editor, dialog };
}

test.describe('with the test email API', () => {
  test.use({ extraApiExtensions: ['v2:report:test-email'] });

  test('configures email reports, sends a test email and saves the options', async ({
    authenticatedPage: page,
    serverApi,
  }) => {
    const requests: unknown[] = [];
    await page.route('**/api/v2/report/test-email', async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          Success: true,
          Error: null,
          StatusCode: 'OK',
          Data: { Log: ['Email sent successfully using server: smtps://mail.example.com:465'] },
        },
      });
    });

    const { editor, dialog } = await openEmailDialog(page);
    await expect(dialog.getByLabel('Send reports to')).toHaveValue('old@example.com');

    await dialog.getByLabel('Send reports to').fill('me@example.com');
    await dialog.getByLabel('SMTP server URL').fill('smtps://mail.example.com:465');
    await dialog.getByLabel('Username').fill('me');
    await dialog.getByLabel('Password', { exact: true }).fill('secret');
    await dialog.locator('sh-checkbox', { hasText: 'Success' }).click();

    await dialog.getByRole('button', { name: 'Send test email' }).click();
    await expect(dialog.getByText('The test email was sent')).toBeVisible();
    expect(requests).toEqual([
      {
        Options: {
          'send-mail-to': 'me@example.com',
          'send-mail-url': 'smtps://mail.example.com:465',
          'send-mail-username': 'me',
          'send-mail-password': 'secret',
          'send-mail-level': 'Warning,Error,Fatal',
        },
        BackupId: null,
        IncludeGlobalOptions: false,
      },
    ]);
    await dialog.getByText('The test email was sent').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/email-reports-dialog-test.png' });

    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog).toHaveCount(0);

    await editor.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
    expect(serverApi.settingsRequests[0].request().postDataJSON()).toEqual({
      '--send-mail-to': 'me@example.com',
      '--send-mail-url': 'smtps://mail.example.com:465',
      '--send-mail-username': 'me',
      '--send-mail-password': 'secret',
      '--send-mail-level': 'Warning,Error,Fatal',
    });
    await serverApi.settingsRequests[0].fulfill({ json: {} });
  });

  test('stopping a test email aborts the request', async ({ authenticatedPage: page }) => {
    // The server never answers, like one waiting on an unreachable mail server
    await page.route('**/api/v2/report/test-email', () => {});
    const aborted = page.waitForEvent('requestfailed', (request) =>
      request.url().includes('/api/v2/report/test-email')
    );

    const { dialog } = await openEmailDialog(page);
    await dialog.getByRole('button', { name: 'Send test email' }).click();
    await expect(dialog.getByText('Sending test email to old@example.com')).toBeVisible();
    await dialog.getByRole('button', { name: 'Stop', exact: true }).click();

    expect((await aborted).failure()?.errorText).toContain('ABORTED');
    await expect(dialog.getByText('The test was stopped.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send test email' })).toBeEnabled();
  });

  test('nudges towards a mail server and fills one in for a provider', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v2/report/test-email', (route) =>
      route.fulfill({ json: { Success: true, Error: null, StatusCode: 'OK', Data: { Log: [] } } })
    );
    const { dialog } = await openEmailDialog(page);
    const warning = dialog.getByText('No mail server is set.');
    await expect(warning).toBeVisible();

    // A test without a server is only accepted by the recipient's server
    await dialog.getByRole('button', { name: 'Send test email' }).click();
    await expect(dialog.getByText('it may land in spam')).toBeVisible();
    await page.screenshot({ path: 'test-results/email-reports-no-server.png' });

    await dialog.getByRole('button', { name: 'Fill in for a provider' }).click();
    await page.getByRole('button', { name: 'Gmail', exact: true }).click();
    await expect(dialog.getByLabel('SMTP server URL')).toHaveValue('smtps://smtp.gmail.com:465');
    await expect(dialog.getByLabel('Username')).toBeFocused();
    await expect(dialog.getByText('Gmail needs an app password')).toBeVisible();
    await expect(warning).toHaveCount(0);
    await expect(dialog.getByText('it may land in spam')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/email-reports-gmail.png' });
  });

  test('shows the error when the test email fails', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v2/report/test-email', (route) =>
      route.fulfill({
        json: { Success: false, Error: '535 Authentication failed', StatusCode: 'send-failed', Data: { Log: [] } },
      })
    );

    const { dialog } = await openEmailDialog(page);
    await dialog.getByRole('button', { name: 'Send test email' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'could not be sent' })).toContainText(
      '535 Authentication failed'
    );
  });
});

test('hides the test button on a server without the test email API', async ({ authenticatedPage: page }) => {
  const { dialog } = await openEmailDialog(page);
  await expect(dialog.getByLabel('Send reports to')).toHaveValue('old@example.com');
  await expect(dialog.getByRole('button', { name: 'Send test email' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
});
