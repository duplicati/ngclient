import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixture';

for (const encrypted of [false, true]) {
  test(`backs up ${encrypted ? 'AES-encrypted' : 'unencrypted'} local files and restores original contents`, async ({
    page,
    liveServer,
  }) => {
    const { api, directory, password } = liveServer;
    const prefix = encrypted ? 'encrypted-roundtrip' : 'roundtrip';
    const passphrase = randomUUID();
    const jobName = encrypted ? 'Live encrypted backup and restore' : 'Live backup and restore';
    const source = join(directory, prefix + '-source');
    const documents = join(source, 'Documents');
    const remote = join(directory, prefix + '-remote');
    const restored = join(directory, prefix + '-restored');
    await mkdir(documents, { recursive: true });
    await mkdir(remote);
    await mkdir(restored);
    const text = Buffer.from('Duplicati live round trip\n日本語 and čeština\n', 'utf8');
    const binary = Buffer.from([0, 1, 2, 127, 128, 254, 255, 10]);
    await writeFile(join(documents, 'message.txt'), text);
    await writeFile(join(documents, 'bytes.bin'), binary);
    await writeFile(join(source, 'unselected.txt'), 'This sibling must not be restored.');
    const created = await api.post('/api/v1/backups', {
      data: {
        Backup: {
          Name: jobName,
          TargetURL: pathToFileURL(remote).href,
          Sources: [source + sep],
          Settings: [
            ...(encrypted
              ? [
                  { Name: 'encryption-module', Value: 'aes' },
                  { Name: 'passphrase', Value: passphrase },
                ]
              : [{ Name: '--no-encryption', Value: 'true' }]),
            { Name: '--snapshot-policy', Value: 'off' },
          ],
          Filters: [],
          Tags: [],
          Metadata: {},
        },
        Schedule: null,
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const { ID } = await created.json();
    expect(ID).toBeTruthy();
    try {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/login');
      await page.getByPlaceholder('Enter your password').fill(password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL('/', { timeout: 20_000 });
      const row = page.locator('.backups .backup').filter({ hasText: jobName });
      const started = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/backup/${ID}/start`
      );
      await row.getByRole('button', { name: 'Start', exact: true }).click();
      const start = await started;
      expect(start.ok()).toBe(true);
      const { ID: task } = await start.json();
      expect(task).toBeTruthy();
      await expect
        .poll(
          async () => {
            const result = await api.get(`/api/v1/task/${task}`);
            expect(result.ok()).toBe(true);
            const state = await result.json();
            expect(state.Status, state.ErrorMessage).not.toBe('Failed');
            return state.Status;
          },
          { timeout: 90_000 }
        )
        .toBe('Completed');
      const versions = await api.post('/api/v2/backup/list-filesets', { data: { BackupId: ID } });
      expect(versions.ok()).toBe(true);
      const filesets = await versions.json();
      expect(filesets.Success).toBe(true);
      expect(filesets.Data).toHaveLength(1);
      const volumes = await readdir(remote);
      expect(volumes.some((name) => name.includes('.dlist.'))).toBe(true);
      expect(volumes.every((name) => name.endsWith('.aes'))).toBe(encrypted);
      // Original files now differ: the assertions below must verify the backed-up version.
      await writeFile(join(documents, 'message.txt'), 'Changed after the backup');
      await writeFile(join(documents, 'bytes.bin'), Buffer.from([9, 9, 9]));
      await page.getByRole('link', { name: 'Restore', exact: true }).click();
      await page.locator('app-restore sh-card').filter({ hasText: jobName }).click();
      const folder = page
        .locator('app-file-tree')
        .getByRole('treeitem')
        .filter({ has: page.locator('.text').getByText('Documents', { exact: true }) });
      await expect(folder).toBeVisible({ timeout: 20_000 });
      await folder.press('ArrowRight');
      await expect(page.locator('app-file-tree .text').getByText('message.txt', { exact: true })).toBeVisible();
      await folder.locator('.text').getByText('Documents', { exact: true }).click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.locator('sh-radio').filter({ hasText: 'Pick location' }).click();
      await page.getByRole('button', { name: 'Manually type path', exact: true }).click();
      await page.locator('[formcontrolname=restoreFromPath]').fill(restored);
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      await expect(page.locator('sh-card').filter({ hasText: 'Restore completed' })).toBeVisible({ timeout: 90_000 });
      const files = (await readdir(restored, { recursive: true, withFileTypes: true })).filter((entry) =>
        entry.isFile()
      );
      expect(files.map((entry) => entry.name).sort()).toEqual(['bytes.bin', 'message.txt']);
      for (const [name, expected] of [
        ['message.txt', text],
        ['bytes.bin', binary],
      ] as const) {
        const file = files.find((entry) => entry.name === name)!;
        expect(await readFile(join(file.parentPath, file.name))).toEqual(expected);
      }
      expect(await readFile(join(documents, 'message.txt'))).not.toEqual(text);
      expect(errors).toEqual([]);
    } finally {
      const deleted = await api.delete(`/api/v1/backup/${ID}`, {
        params: { 'delete-local-db': 'true', 'delete-remote-files': 'false' },
      });
      expect(deleted.ok()).toBe(true);
    }
  });
}
