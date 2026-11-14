import { type Page, type Route } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

const json = (name: string) => Buffer.from(JSON.stringify({ Backup: { Name: name } }));
async function openImport(page: Page) {
  const requests: Route[] = [];
  await page.route('**/api/v1/backups/import', (route) => {
    requests.push(route);
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/import');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const component = page.locator('app-import');
  await expect(component).toBeVisible();
  return {
    component,
    upload: component.locator('input[type=file]'),
    submit: component.getByRole('button', { name: 'Import', exact: true }),
    requests,
  };
}

test('removing an import file disables import instead of retaining its payload', async ({
  authenticatedPage: page,
}) => {
  const { upload, submit, requests } = await openImport(page);
  await upload.setInputFiles({ name: 'config.json', mimeType: 'application/json', buffer: json('Original') });
  await expect(submit).toBeEnabled();
  await upload.setInputFiles([]);
  await expect(submit).toBeDisabled();
  expect(requests).toHaveLength(0);
});

test('a failed replacement read clears the old file and allows a fresh selection', async ({
  authenticatedPage: page,
}) => {
  // Install the fault only on this already authenticated page; normal reads still use the native reader.
  await page.evaluate(() => {
    const Reader = window.FileReader;
    window.FileReader = class extends Reader {
      override readAsArrayBuffer(blob: Blob) {
        if (blob instanceof File && blob.name === 'unreadable.json') {
          queueMicrotask(() => this.dispatchEvent(new ProgressEvent('error')));
        } else super.readAsArrayBuffer(blob);
      }
    };
  });
  const { component, upload, submit, requests } = await openImport(page);
  await upload.setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: json('Old') });
  await expect(submit).toBeEnabled();
  await upload.setInputFiles({ name: 'unreadable.json', mimeType: 'application/json', buffer: json('Unreadable') });
  await expect(page.getByRole('heading', { name: 'Failed to read configuration file', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(submit).toBeDisabled();
  await upload.setInputFiles({ name: 'fresh.json', mimeType: 'application/json', buffer: json('Fresh') });
  await expect(submit).toBeEnabled();
  await component
    .locator('sh-toggle')
    .filter({ hasText: 'Save now' })
    .locator('input[type=checkbox]:not(.internal-input)')
    .check();
  await submit.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].request().postDataJSON().config).toBe(json('Fresh').toString('base64'));
  await requests[0].fulfill({ json: { data: null } });
  await expect(page).toHaveURL('/');
});

test('a slower previous read cannot replace the latest selected configuration', async ({ authenticatedPage: page }) => {
  await page.evaluate(() => {
    const Reader = window.FileReader;
    window.FileReader = class extends Reader {
      override readAsArrayBuffer(blob: Blob) {
        if (blob instanceof File && blob.name === 'slow.json') {
          this.addEventListener('loadend', () => {
            (window as Window & { slowReadComplete?: boolean }).slowReadComplete = true;
          });
          (window as Window & { releaseSlowRead?: () => void }).releaseSlowRead = () => super.readAsArrayBuffer(blob);
        } else super.readAsArrayBuffer(blob);
      }
    };
  });
  const { component, upload, submit, requests } = await openImport(page);
  await upload.setInputFiles({ name: 'slow.json', mimeType: 'application/json', buffer: json('Old') });
  await expect(submit).toBeDisabled();
  await upload.setInputFiles({ name: 'latest.json', mimeType: 'application/json', buffer: json('Latest') });
  await expect(submit).toBeEnabled();
  await page.evaluate(() => (window as Window & { releaseSlowRead?: () => void }).releaseSlowRead?.());
  await page.waitForFunction(() => (window as Window & { slowReadComplete?: boolean }).slowReadComplete === true);
  await component
    .locator('sh-toggle')
    .filter({ hasText: 'Save now' })
    .locator('input[type=checkbox]:not(.internal-input)')
    .check();
  await submit.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].request().postDataJSON().config).toBe(json('Latest').toString('base64'));
  expect(requests[0].request().postDataJSON()).not.toHaveProperty('global_options');
  await requests[0].fulfill({ json: { data: null } });
  await expect(page).toHaveURL('/');
});

test.describe('global advanced options import', () => {
  test.beforeEach(async ({ page, serverApi }) => {
    void serverApi;
    await page.route('**/api/v1/systeminfo', (route) =>
      route.fulfill({
        json: {
          Version: 'Browser test',
          DefaultUsageReportLevel: 'information',
          StartedBy: 'TrayIcon',
          BackendModules: [],
          EncryptionModules: [],
          CompressionModules: [],
          GenericModules: [],
          Options: [],
          ServerOnlyOptions: [],
          SpecialFolders: [],
          APIExtensions: [
            'v1:websocket',
            'v1:websocket:authenticate',
            'v1:subscribe:backuplist',
            'v1:subscribe:notifications',
            'v1:subscribe:remotecontrol',
            'v1:backup:export-global-settings',
          ],
        },
      })
    );
  });

  async function ready(page: Page) {
    const controls = await openImport(page);
    await controls.upload.setInputFiles({
      name: 'globals.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          Backup: { Name: 'Imported job', Settings: [{ Name: '--blocksize', Value: '1MB' }] },
          GlobalSettings: [{ Name: 'send-mail-subject', Value: 'Global report' }],
        })
      ),
    });
    await expect(controls.submit).toBeEnabled();
    const choice = page.getByLabel('Global advanced options', { exact: true });
    await expect(choice).toHaveValue('ignore');
    const saveNow = controls.component
      .locator('sh-toggle')
      .filter({ hasText: 'Save now' })
      .locator('input[type=checkbox]:not(.internal-input)');
    return { ...controls, choice, saveNow };
  }

  test('keeps ignoring global options as the default', async ({ authenticatedPage: page }) => {
    const { saveNow, submit, requests } = await ready(page);
    await saveNow.check();
    await submit.click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].request().postDataJSON().global_options).toBe('ignore');
    await requests[0].fulfill({ json: { data: null } });
    await expect(page).toHaveURL('/');
  });

  test('selects merging with the keyboard and sends the selected policy', async ({ authenticatedPage: page }) => {
    const { choice, saveNow, submit, requests } = await ready(page);
    await choice.focus();
    await choice.press('ArrowDown');
    await choice.press('Enter');
    await expect(choice).toHaveValue('merge');
    await saveNow.check();
    await submit.click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].request().postDataJSON().global_options).toBe('merge');
    await requests[0].fulfill({ json: { data: null } });
    await expect(page).toHaveURL('/');
  });

  test('requires Save now and confirmation before applying server-wide options', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const { choice, saveNow, submit, requests } = await ready(page);
    await expect(choice.locator('option[value=apply]')).toHaveCount(0);
    await saveNow.check();
    await choice.selectOption('apply');
    await saveNow.uncheck();
    await expect(choice).toHaveValue('ignore');
    await expect(choice.locator('option[value=apply]')).toHaveCount(0);
    await saveNow.check();
    await choice.selectOption('apply');
    await page.screenshot({ path: testInfo.outputPath('import-global-options.png'), fullPage: true });
    await submit.click();
    await expect(page.getByText('Apply global advanced options?', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('apply-confirmation.png'), fullPage: true });
    expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(requests).toHaveLength(0);
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.getByRole('button', { name: 'Apply and import', exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].request().postDataJSON()).toMatchObject({ direct: true, global_options: 'apply' });
    await requests[0].fulfill({ json: { data: null } });
    await expect(page).toHaveURL('/');
  });
});

test('configuration import Back supports native new tabs and keyboard navigation without importing', async ({
  authenticatedPage: page,
}) => {
  const { component, upload, submit, requests } = await openImport(page);
  await upload.setInputFiles({ name: 'config.json', mimeType: 'application/json', buffer: json('Unsubmitted') });
  await expect(submit).toBeEnabled();
  const back = component.getByRole('link', { name: 'Back', exact: true });
  await expect(back).toHaveAttribute('href', '/');
  const home = new URL('/', page.url()).href;
  // Verify native new-tab navigation without starting another authenticated application session.
  await page
    .context()
    .route(home, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Home target</title>' }));
  for (const click of [{ modifiers: ['Control' as const] }, { button: 'middle' as const }]) {
    const opened = page.context().waitForEvent('page');
    await back.click(click);
    const tab = await opened;
    await expect(tab).toHaveURL(home);
    await tab.close();
    await expect(page).toHaveURL('/backup/import');
    await expect(submit).toBeEnabled();
    expect(await upload.evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe('config.json');
    expect(requests).toHaveLength(0);
  }
  await back.focus();
  await expect(back).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
});
