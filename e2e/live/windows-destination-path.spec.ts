import { mkdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixture';

test('keeps a Windows drive path intact while typing, saving and reloading', async ({ page, liveServer }, testInfo) => {
  const { api, directory, password } = liveServer;
  const info = await (await api.get('/api/v1/systeminfo')).json();
  test.skip(info.OSType !== 'Windows', 'Requires a real Windows server, not mocked system information.');
  expect(info.DirectorySeparator).toBe('\\');
  const source = join(directory, 'drive-source'),
    remote = join(directory, 'drive-remote');
  await mkdir(source);
  await mkdir(remote);
  const created = await api.post('/api/v1/backups', {
    data: {
      Backup: {
        Name: 'Windows drive path regression',
        TargetURL: pathToFileURL(remote).href,
        Sources: [source + sep],
        Settings: [{ Name: '--no-encryption', Value: 'true' }],
        Filters: [],
        Tags: [],
        Metadata: {},
      },
      Schedule: null,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { ID: id } = await created.json();
  expect(id).toBeTruthy();
  try {
    const errors: string[] = [],
      operations: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/(start|test|createfolder)$/.test(new URL(r.url()).pathname))
        operations.push(r.url());
    });
    await page.goto('/login');
    await page.getByPlaceholder('Enter your password').fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.goto(`/backup/${id}/destination`);
    const manual = page.getByRole('button', { name: 'Manually type path', exact: true });
    await manual.click();
    const input = page.locator('app-single-destination app-file-tree input[type=text]').first();
    await input.fill('');
    const typed: string[] = [];
    for (const [keys, value] of [
      ['C', 'C'],
      [':', 'C:'],
      ['\\', 'C:\\'],
      ['Backup', 'C:\\Backup'],
    ]) {
      await input.pressSequentially(keys);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(input).toHaveValue(value);
      typed.push(await input.inputValue());
    }
    await input.press('Tab');
    await expect(input).toHaveValue('C:\\Backup');
    const pending = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/v1/backup/${id}`
    );
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const response = await pending;
    expect(response.ok(), await response.text()).toBe(true);
    const storedResponse = await api.get(`/api/v1/backup/${id}`);
    expect(storedResponse.ok()).toBe(true);
    const stored = await storedResponse.json();
    const windowsPath = (url: string) =>
      decodeURIComponent(url)
        .replace(/^file:\/\/\/?/i, '')
        .replaceAll('/', '\\');
    expect(windowsPath(response.request().postDataJSON().Backup.TargetURL)).toBe('C:\\Backup');
    expect(windowsPath(stored.Backup.TargetURL)).toBe('C:\\Backup');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    if (!(await input.isVisible())) await manual.click();
    await expect(input).toHaveValue('C:\\Backup');
    expect(errors).toEqual([]);
    expect(operations).toEqual([]);
    await testInfo.attach('windows-path-results', {
      contentType: 'application/json',
      body: JSON.stringify({
        typed,
        stored: stored.Backup.TargetURL,
        server: info.ServerVersionName,
        runtime: info.CLRVersion,
        operations,
        errors,
      }),
    });
  } finally {
    expect(
      (
        await api.delete(`/api/v1/backup/${id}`, {
          params: { 'delete-local-db': 'false', 'delete-remote-files': 'false' },
        })
      ).ok()
    ).toBe(true);
  }
});
