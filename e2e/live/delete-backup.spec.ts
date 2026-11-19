import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixture';

for (const deleteLocal of [false, true]) {
  test(`cold deletion loads the job, cancels safely and preserves remote data (local DB deletion=${deleteLocal})`, async ({
    page,
    liveServer,
  }, testInfo) => {
    const { api, directory, password } = liveServer;
    const source = join(directory, `delete-source-${deleteLocal}`),
      remote = join(directory, `delete-remote-${deleteLocal}`);
    await mkdir(source);
    await mkdir(remote);
    await writeFile(join(source, 'payload.txt'), 'Remote data must survive deleting the job configuration.');
    const created = await api.post('/api/v1/backups', {
      data: {
        Backup: {
          Name: `Delete audit ${deleteLocal}`,
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
    const endpoint = `/api/v1/backup/${id}`;
    let removed = false;
    try {
      const started = await api.post(`${endpoint}/start`);
      expect(started.ok(), await started.text()).toBe(true);
      const { ID: taskId } = await started.json();
      expect(taskId).toBeTruthy();
      await expect
        .poll(async () => (await (await api.get(`/api/v1/task/${taskId}`)).json()).Status, { timeout: 60000 })
        .toBe('Completed');
      const details = await (await api.get(endpoint)).json();
      const db = details.Backup.DBPath as string;
      const dbRelative = relative(directory, db);
      expect(isAbsolute(dbRelative) || dbRelative === '..' || dbRelative.startsWith('..' + sep)).toBe(false);
      expect(existsSync(db)).toBe(true);
      const hashes = async () =>
        Promise.all(
          (await readdir(remote)).sort().map(async (name) => ({
            name,
            hash: createHash('sha256')
              .update(await readFile(join(remote, name)))
              .digest('hex'),
          }))
        );
      const before = await hashes();
      expect(before.length).toBeGreaterThan(0);
      const requests: string[] = [];
      page.on('request', (r) => {
        if (r.method() === 'DELETE' && new URL(r.url()).pathname === endpoint) requests.push(r.url());
      });
      await page.goto('/login');
      await page.getByPlaceholder('Enter your password').fill(password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL('/');
      // Hard navigation recreates the application, leaving no warmed backup list.
      await page.goto(`/backup/${id}/delete`);
      await expect(
        page.getByRole('heading', { name: `Delete backup: Delete audit ${deleteLocal}`, exact: true })
      ).toBeVisible();
      const option = (name: string) =>
        page
          .locator('app-delete-backup section')
          .filter({ has: page.getByRole('heading', { name, exact: true }) })
          .getByRole('checkbox');
      const local = option('Delete local database');
      const remoteCheckbox = option('Delete remote files');
      await expect(local).toBeEnabled();
      await expect(remoteCheckbox).toBeVisible();
      await local.setChecked(deleteLocal);
      await expect(remoteCheckbox).not.toBeChecked();
      const button = page.getByRole('button', { name: 'Delete backup', exact: true });
      await button.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(requests).toHaveLength(0);
      expect(existsSync(db)).toBe(true);
      expect(await hashes()).toEqual(before);
      expect((await api.get(endpoint)).ok()).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('loaded-delete.png') });
      await button.click();
      const pending = page.waitForResponse(
        (r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === endpoint
      );
      await page.getByRole('dialog').getByRole('button', { name: 'Delete backup', exact: true }).click();
      const response = await pending;
      expect(response.ok(), await response.text()).toBe(true);
      expect(requests).toHaveLength(1);
      const query = new URL(requests[0]).searchParams;
      expect(query.get('delete-local-db')).toBe(String(deleteLocal));
      expect(query.get('delete-remote-files')).toBe('false');
      await expect.poll(async () => (await api.get(endpoint)).status()).toBe(404);
      removed = true;
      await expect.poll(() => existsSync(db)).toBe(!deleteLocal);
      expect(await hashes()).toEqual(before);
      await testInfo.attach('deletion-results', {
        body: JSON.stringify({
          deleteLocal,
          requests: requests.length,
          remoteFiles: before.length,
          remoteHashesPreserved: true,
          dbRetained: existsSync(db),
        }),
        contentType: 'application/json',
      });
    } finally {
      if (!removed)
        await api.delete(endpoint, { params: { 'delete-local-db': 'false', 'delete-remote-files': 'false' } });
    }
  });
}
