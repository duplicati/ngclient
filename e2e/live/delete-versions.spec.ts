import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixture';

for (const compact of [false, true]) {
  test(`deletes only the selected version and restores the survivors with compaction ${compact ? 'on' : 'off'}`, async ({
    page,
    liveServer,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { api, directory, password } = liveServer;
    const root = join(directory, compact ? 'delete-compact-on' : 'delete-compact-off');
    const source = join(root, 'source');
    const remote = join(root, 'remote');
    await mkdir(source, { recursive: true });
    await mkdir(remote);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    async function json(method: 'get' | 'post', url: string, data?: unknown) {
      const response = await api[method](url, data === undefined ? {} : { data });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    }
    async function waitTask(id: number) {
      expect(id).toBeTruthy();
      await expect
        .poll(
          async () => {
            const task = await json('get', `/api/v1/task/${id}`);
            expect(task.Status, task.ErrorMessage).not.toBe('Failed');
            return task.Status;
          },
          { timeout: 90_000 }
        )
        .toBe('Completed');
    }
    const markers = ['oldest', 'middle', 'newest'];
    const contents = markers.map((name) => Buffer.from(`Original ${name} version\n日本語 and čeština\n`));
    const { ID: id } = await json('post', '/api/v1/backups', {
      Backup: {
        Name: `Live delete versions compact ${compact ? 'on' : 'off'}`,
        TargetURL: pathToFileURL(remote).href,
        Sources: [source + sep],
        Tags: [],
        Filters: [],
        Metadata: {},
        Settings: [
          { Name: '--no-encryption', Value: 'true' },
          { Name: '--snapshot-policy', Value: 'off' },
          { Name: '--blocksize', Value: '100kb' },
          { Name: '--dblock-size', Value: '1mb' },
          // Prove the per-operation checkbox overrides this persistent setting.
          { Name: '--no-auto-compact', Value: 'true' },
        ],
      },
      Schedule: null,
    });
    expect(id).toBeTruthy();
    try {
      const list = async () => {
        const result = await json('post', '/api/v2/backup/list-filesets', { BackupId: id });
        expect(result.Success, JSON.stringify(result)).toBe(true);
        return result.Data as Array<{ Version: number; Time: string }>;
      };
      const blocks = async () => (await readdir(remote)).filter((name) => name.includes('.dblock.')).sort();
      const payloads = Array.from({ length: 34 }, (_, i) => join(source, `middle-${i}.bin`));
      for (let generation = 0; generation < 3; generation++) {
        if (generation > 0) {
          const previous = (await list())[0].Time;
          // Filesets have second precision; do not accidentally create the same timestamp twice.
          await expect
            .poll(() => Math.floor(Date.now() / 1000), { timeout: 5_000 })
            .toBeGreaterThan(Math.floor(Date.parse(previous) / 1000));
          await unlink(join(source, `${markers[generation - 1]}.txt`));
        }
        await writeFile(join(source, `${markers[generation]}.txt`), contents[generation]);
        await writeFile(join(source, 'contents.bin'), Buffer.from([generation, 0, 128, 255]));
        if (generation === 1) for (const path of payloads) await writeFile(path, randomBytes(600 * 1024));
        if (generation === 2) for (const path of payloads) await unlink(path);
        const started = await json('post', `/api/v1/backup/${id}/start`);
        await waitTask(started.ID);
        expect(await list()).toHaveLength(generation + 1);
      }
      const before = await list();
      expect(before.map((x) => x.Version)).toEqual([0, 1, 2]);
      const beforeBlocks = await blocks();
      expect(beforeBlocks.length).toBeGreaterThan(10);
      const logIds = new Set((await json('get', `/api/v1/backup/${id}/log`)).map((x: { ID: number }) => x.ID));
      const requests: unknown[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v2/backup/delete-versions')
          requests.push(request.postDataJSON());
      });
      await page.goto('/login');
      await page.getByPlaceholder('Enter your password').fill(password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL('/');
      await page.goto(`/backup/${id}/delete-versions`);
      await expect(page.getByRole('heading', { name: /^Delete versions from/ })).toBeVisible();
      const row = (version: number) =>
        page.getByRole('row').filter({
          has: page.getByRole('cell', { name: String(version), exact: true }).and(page.locator('td:nth-child(2)')),
        });
      for (const version of [0, 1, 2]) await expect(row(version)).toBeVisible();
      const checkbox = page.locator('sh-checkbox').filter({ hasText: 'Compact after deletion' }).locator('input');
      await expect(checkbox).toBeChecked();
      await checkbox.setChecked(compact);
      await row(1).locator('sh-checkbox').click();
      await expect(row(1).getByRole('checkbox')).toBeChecked();
      for (const version of [0, 2]) await expect(row(version).getByRole('checkbox')).not.toBeChecked();
      const action = page.getByRole('button', { name: 'Delete 1 version', exact: true });
      await action.click();
      const dialog = page.getByRole('dialog');
      expect(requests).toEqual([]);
      expect(await list()).toEqual(before);
      expect(await blocks()).toEqual(beforeBlocks);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(requests).toEqual([]);
      expect(await list()).toEqual(before);
      await action.click();
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/v2/backup/delete-versions'
      );
      await dialog.getByRole('button', { name: 'Delete versions', exact: true }).click();
      const deleted = await pending;
      expect(deleted.ok(), await deleted.text()).toBe(true);
      expect(requests).toEqual([{ BackupId: id, Versions: [1], SuppressCompact: !compact }]);
      await waitTask((await deleted.json()).ID);
      const after = await list();
      expect(after.map((x) => x.Time)).toEqual([before[0].Time, before[2].Time]);
      // Verify recoverability, not merely search metadata. Mutate the live source first.
      await writeFile(join(source, 'newest.txt'), 'Changed after the backup');
      await writeFile(join(source, 'contents.bin'), Buffer.from([9]));
      for (const [version, generation] of [
        [0, 2],
        [1, 0],
      ] as const) {
        const restored = join(root, `restored-${version}`);
        await mkdir(restored);
        const restore = await json('post', `/api/v1/backup/${id}/restore`, {
          paths: [source + sep + '*'],
          time: after[version].Time,
          restore_path: restored,
          overwrite: true,
          permissions: false,
          skip_metadata: true,
        });
        await waitTask(restore.ID);
        const files = (await readdir(restored, { recursive: true, withFileTypes: true })).filter((x) => x.isFile());
        expect(files.map((x) => x.name).sort()).toEqual(['contents.bin', `${markers[generation]}.txt`].sort());
        for (const [name, expected] of [
          [`${markers[generation]}.txt`, contents[generation]],
          ['contents.bin', Buffer.from([generation, 0, 128, 255])],
        ] as const) {
          const file = files.find((x) => x.name === name)!;
          expect(await readFile(join(file.parentPath, file.name))).toEqual(expected);
        }
      }
      const logs = await json('get', `/api/v1/backup/${id}/log`);
      const result = logs
        .filter((x: { ID: number; Type: string }) => x.Type === 'Result' && !logIds.has(x.ID))
        .map((x: { Message: string }) => JSON.parse(x.Message))
        .find((x: { DeletedSetsActualLength?: number }) => x.DeletedSetsActualLength === 1);
      expect(result).toBeTruthy();
      const afterBlocks = await blocks();
      if (compact) {
        expect(result.CompactResults.DeletedFileCount).toBeGreaterThan(0);
        expect(afterBlocks.length).toBeLessThan(beforeBlocks.length);
      } else {
        expect(result.CompactResults).toBeNull();
        expect(afterBlocks).toEqual(beforeBlocks);
      }
      const saved = await json('get', `/api/v1/backup/${id}`);
      expect(
        saved.Backup.Settings.find((x: { Name: string }) => x.Name.replace(/^--/, '') === 'no-auto-compact')?.Value
      ).toBe('true');
      expect(errors).toEqual([]);
      const info = await json('get', '/api/v1/systeminfo');
      const evidence = testInfo.outputPath('delete-versions-results.json');
      await writeFile(
        evidence,
        JSON.stringify(
          {
            compact,
            requests,
            before,
            after,
            beforeBlocks,
            afterBlocks,
            compactResults: result.CompactResults,
            restoredVersions: [0, 1],
            server: { version: info.ServerVersionName, runtime: info.CLRVersion },
          },
          null,
          2
        )
      );
      await testInfo.attach('delete-versions-results', {
        contentType: 'application/json',
        path: evidence,
      });
    } finally {
      const deleted = await api.delete('/api/v1/backup/' + id, {
        params: { 'delete-local-db': 'true', 'delete-remote-files': 'false' },
      });
      expect(deleted.ok(), await deleted.text()).toBe(true);
      const cleanup = await deleted.json();
      expect(cleanup.Status).toBe('OK');
      if (cleanup.ID != null) await waitTask(cleanup.ID);
    }
  });
}
