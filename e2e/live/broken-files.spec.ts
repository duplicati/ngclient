import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { test, expect } from './fixture';
import type { ListBrokenFilesResponseDto } from '../../projects/ngclient/src/app/core/openapi';

test('lists missing-volume damage without mutations until confirmation and restores the unaffected version after purge', async ({
  page,
  liveServer,
}, testInfo) => {
  test.setTimeout(180_000);
  const { api, directory: root, password } = liveServer;
  const errors: string[] = [];
  const events: unknown[] = [];
  const record = (event: string, data: unknown) => events.push({ event, data });
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(check: () => Promise<any>, label: string) {
    let result: any;
    await expect
      .poll(
        async () => {
          result = await check();
          return !!result;
        },
        { timeout: 90_000, message: label }
      )
      .toBe(true);
    return result;
  }
  async function json(method: 'get' | 'post', url: string, data?: unknown): Promise<any> {
    const r = await api[method](url, data === undefined ? {} : { data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  async function search(id: string, pattern: string, version: number) {
    const result = await json('post', '/api/v2/backup/search', {
      BackupId: id,
      Version: [version],
      Time: null,
      Paths: null,
      Filters: [pattern],
      PageSize: 100,
      Page: 0,
      ReturnExtended: false,
      SearchMetadata: false,
    });
    expect(result.Success).toBe(true);
    return result.Data;
  }
  const info = await json('get', '/api/v1/systeminfo');
  record('server', { version: info.ServerVersionName, runtime: info.CLRVersion });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('/');
  let jobId: string | undefined;
  try {
    const fixture = await fs.mkdtemp(path.join(root, 'fixture-'));
    const source = path.join(fixture, 'source');
    const remote = path.join(fixture, 'remote');
    const removed = path.join(fixture, 'quarantine');
    const restore = path.join(fixture, 'restore');
    for (const dir of [source, remote, removed, restore]) await fs.mkdir(dir);
    const safePath = path.join(source, 'healthy.txt');
    const safeContent = 'unaffected generation fixture\n';
    await fs.writeFile(safePath, safeContent);
    const { ID: id } = await json('post', '/api/v1/backups', {
      Backup: {
        Name: 'Broken files fixture',
        TargetURL: `file://${remote.replaceAll('\\', '/')}`,
        Sources: [source + path.sep],
        Tags: [],
        Filters: [],
        Metadata: {},
        Settings: [
          { Name: '--no-encryption', Value: 'true' },
          { Name: '--snapshot-policy', Value: 'off' },
          { Name: '--blocksize', Value: '100kb' },
          { Name: '--dblock-size', Value: '1mb' },
          { Name: '--no-auto-compact', Value: 'true' },
        ],
      },
      Schedule: null,
    });
    jobId = id;
    const waitTask = async (taskId: number) =>
      await until(async () => {
        const task = await json('get', `/api/v1/task/${taskId}`);
        assert.notEqual(task.Status, 'Failed', JSON.stringify(task));
        return task.Status === 'Completed' ? task : null;
      }, `task ${taskId}`);
    const runBackup = async () => {
      const { ID: taskId } = await json('post', `/api/v1/backup/${id}/start`);
      await waitTask(taskId);
      await delay(1400);
    };
    const list = async () => {
      const response = await json('post', '/api/v2/backup/list-filesets', { BackupId: id });
      assert(response.Success, JSON.stringify(response));
      return response.Data as Array<{ Version: number; Time: string }>;
    };
    const broken = async () => await json('post', '/api/v2/backup/list-broken-files', { BackupId: id });
    await runBackup();
    const oldVolumes = new Set(await fs.readdir(remote));
    await fs.writeFile(path.join(source, 'damaged.bin'), randomBytes(3 * 1024 * 1024));
    await runBackup();
    const before = await list();
    assert.deepEqual(
      before.map((entry) => entry.Version),
      [0, 1]
    );
    const healthy = before[1];
    const newest = before[0];
    assert.equal((await search(id, '*healthy.txt', 1)).length, 1);
    assert.equal((await search(id, '*damaged.bin', 0)).length, 1);
    assert.deepEqual((await broken()).Data ?? [], []);
    const candidates = (await fs.readdir(remote)).filter((file) => file.includes('.dblock.') && !oldVolumes.has(file));
    const sizes = await Promise.all(
      candidates.map(async (file) => ({ file, size: (await fs.stat(path.join(remote, file))).size }))
    );
    sizes.sort((a, b) => b.size - a.size);
    assert(sizes[0]?.size > 800000);
    await fs.rename(path.join(remote, sizes[0].file), path.join(removed, sizes[0].file));
    record('fixture-damaged', {
      id,
      healthy: healthy.Time,
      newest: newest.Time,
      missing: sizes[0].file,
      bytes: sizes[0].size,
    });
    const { Backup } = await json('get', `/api/v1/backup/${id}`);
    const dbPath = Backup.DBPath;
    assert(path.resolve(dbPath).startsWith(root + path.sep), 'DB outside test fixture');
    async function snapshot() {
      const files = await Promise.all(
        (await fs.readdir(remote)).sort().map(async (name) => [
          name,
          createHash('sha256')
            .update(await fs.readFile(path.join(remote, name)))
            .digest('hex'),
        ])
      );
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const tables = Object.fromEntries(
          ['Fileset', 'FilesetEntry', 'FileLookup', 'RemoteVolume'].map((table) => [
            table,
            (() => {
              const stmt = db.prepare(`SELECT * FROM "${table}"`);
              stmt.setReadBigInts(true);
              return stmt
                .all()
                .map((row) => JSON.stringify(row, (_, value) => (typeof value === 'bigint' ? value.toString() : value)))
                .sort();
            })(),
          ])
        );
        return { files, catalogHash: createHash('sha256').update(JSON.stringify(tables)).digest('hex') };
      } finally {
        db.close();
      }
    }
    const state = await snapshot();
    const calls: unknown[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/v2/backup/purge-broken-files') calls.push(r);
    });
    const pendingList = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/v2/backup/list-broken-files' && r.request().method() === 'POST'
    );
    await page.goto(`/backup/${id}/broken-files`);
    const listed = (await (await pendingList).json()) as ListBrokenFilesResponseDto;
    assert(listed.Data?.length);
    assert(listed.Data[0].Files);
    record('listed', { listed });
    assert(listed.Success, JSON.stringify(listed));
    assert.equal(listed.Data.length, 1);
    assert.equal(Date.parse(listed.Data[0].FilesetTime), Date.parse(newest.Time));
    assert.deepEqual(
      listed.Data[0].Files.filter((entry) => entry.Size >= 0).map((entry) => path.basename(entry.Path ?? '')),
      ['damaged.bin']
    );
    const damagedPath = listed.Data[0].Files.find((entry) => path.basename(entry.Path ?? '') === 'damaged.bin')?.Path;
    assert(damagedPath);
    await expect(page.getByText(damagedPath, { exact: true })).toBeVisible();
    await expect(page.locator('.fileset-list sh-card')).toHaveCount(1);
    assert.deepEqual(await snapshot(), state);
    const button = page.getByRole('button', { name: 'Purge broken files', exact: true });
    await button.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Confirm purge' })).toBeVisible();
    assert.equal(calls.length, 0);
    assert.deepEqual(await snapshot(), state);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(calls.length, 0);
    assert.deepEqual(await snapshot(), state);
    record('unchanged-before-confirm', {
      purgeRequests: calls.length,
      volumeHashes: state.files.length,
      catalogHash: state.catalogHash,
    });

    await button.click();
    const pendingPurge = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/v2/backup/purge-broken-files' && r.request().method() === 'POST'
    );
    await dialog.getByRole('button', { name: 'Purge broken files', exact: true }).click();
    const purge = await pendingPurge;
    assert(purge.ok());
    assert.equal(calls.length, 1);
    assert.deepEqual(purge.request().postDataJSON(), { BackupId: id });
    const { ID: purgeTask } = await purge.json();
    await waitTask(purgeTask);
    const after = await list();
    const remaining = after.find((entry) => entry.Time === healthy.Time);
    assert(remaining, 'original healthy generation missing');
    assert.equal((await search(id, '*healthy.txt', remaining.Version)).length, 1);
    for (const entry of after) assert.equal((await search(id, '*damaged.bin', entry.Version)).length, 0);
    const afterBroken = await broken();
    assert(afterBroken.Success);
    assert.deepEqual(afterBroken.Data ?? [], []);
    record('purge-completed', {
      id,
      purgeTask,
      before: before.map((entry) => entry.Time),
      after: after.map((entry) => entry.Time),
      healthyVersion: remaining.Version,
      brokenRemaining: afterBroken.Data?.length ?? 0,
    });
    await fs.writeFile(safePath, 'Changed after backup: recovery must use the saved version.');
    const { ID: restoreTask } = await json('post', `/api/v1/backup/${id}/restore`, {
      paths: [safePath],
      time: remaining.Time,
      restore_path: restore,
      overwrite: false,
      permissions: false,
    });
    await waitTask(restoreTask);
    const files = (await fs.readdir(restore, { recursive: true, withFileTypes: true })).filter((entry) =>
      entry.isFile()
    );
    assert.deepEqual(
      files.map((entry) => entry.name),
      ['healthy.txt']
    );
    const contents = await fs.readFile(path.join(files[0].parentPath, files[0].name), 'utf8');
    assert.equal(contents, safeContent);
    record('restore-verified', {
      restoreTask,
      healthyTime: remaining.Time,
      files: files.map((entry) => entry.name),
      sha256: createHash('sha256').update(contents).digest('hex'),
    });

    expect(errors).toEqual([]);
    const evidence = testInfo.outputPath('broken-files-results.json');
    await fs.writeFile(evidence, JSON.stringify(events, null, 2));
    await testInfo.attach('broken-files-results', {
      contentType: 'application/json',
      path: evidence,
    });
  } finally {
    if (jobId)
      expect(
        (
          await api.delete(`/api/v1/backup/${jobId}`, {
            params: { 'delete-local-db': 'false', 'delete-remote-files': 'false' },
          })
        ).ok()
      ).toBe(true);
  }
});
