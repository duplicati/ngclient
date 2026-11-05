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
  await component.locator('input[formcontrolname=direct]').check();
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
  await component.locator('input[formcontrolname=direct]').check();
  await submit.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].request().postDataJSON().config).toBe(json('Latest').toString('base64'));
  await requests[0].fulfill({ json: { data: null } });
  await expect(page).toHaveURL('/');
});
