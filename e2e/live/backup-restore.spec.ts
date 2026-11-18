import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixture';
import type { APIResponse } from '@playwright/test';

for (const mode of ['unencrypted', 'aes-saved', 'aes-direct', 'aes-retry', 'aes-empty', 'aes-wizard'] as const) {
  const wizard = mode === 'aes-wizard';
  const encrypted = mode !== 'unencrypted';
  const retry = mode === 'aes-retry';
  const empty = mode === 'aes-empty';
  const recovery = retry || empty;
  const direct = mode === 'aes-direct' || recovery;
  test(`backs up ${encrypted ? 'AES-encrypted' : 'unencrypted'} local files and restores original contents${wizard ? ' after creating it with the wizard' : empty ? ' after leaving the passphrase empty' : retry ? ' after correcting a wrong passphrase' : direct ? ' without saved settings' : ''}`, async ({
    page,
    liveServer,
  }) => {
    const { api, directory, password } = liveServer;
    const prefix = wizard
      ? 'wizard-roundtrip'
      : empty
        ? 'empty-encrypted-roundtrip'
        : retry
          ? 'retry-encrypted-roundtrip'
          : direct
            ? 'direct-encrypted-roundtrip'
            : encrypted
              ? 'encrypted-roundtrip'
              : 'roundtrip';
    const passphrase = randomUUID();
    const jobName = wizard
      ? 'Live wizard backup and restore'
      : direct
        ? 'Live encrypted direct restore'
        : encrypted
          ? 'Live encrypted backup and restore'
          : 'Live backup and restore';
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
    let created: Pick<APIResponse, 'ok' | 'text' | 'json'>;
    if (wizard) {
      test.setTimeout(180_000);
      await page.goto('/login');
      await page.getByPlaceholder('Enter your password').fill(password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL('/');
      await page.goto('/backup/new/general');
      await page.getByPlaceholder('Your backup name').fill(jobName);
      await page.locator('#password').fill(passphrase);
      await page.locator('#repeatPassword').fill(passphrase);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page).toHaveURL('/backup/new/source-data');
      const directPath = page.getByPlaceholder('Add a direct path');
      await directPath.fill(source + sep);
      await page.locator('app-source-data .row-inputs').filter({ has: directPath }).getByRole('button').click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page).toHaveURL('/backup/new/destination');
      await page.getByPlaceholder('Search for destination...').fill('File system');
      await page
        .locator('app-destination-list-item')
        .filter({ hasText: 'File system' })
        .getByRole('button', { name: 'Choose', exact: true })
        .click();
      await page.getByRole('button', { name: 'Manually type path', exact: true }).click();
      await page.getByLabel('File path', { exact: false }).fill(remote);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page).toHaveURL('/backup/new/schedule');
      await page.locator('app-schedule sh-select').first().click();
      await page.locator('li.option').getByText("Don't run automatically", { exact: true }).click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page).toHaveURL('/backup/new/options');
      const saved = page.waitForResponse(
        (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/backups'
      );
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      created = await saved;
    } else {
      created = await api.post('/api/v1/backups', {
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
    }
    expect(created.ok(), await created.text()).toBe(true);
    const { ID } = await created.json();
    expect(ID).toBeTruthy();
    let originalExists = true;
    const temporaryIds = new Set<string>();
    const deleteJob = async (id: string) => {
      const response = await api.delete(`/api/v1/backup/${id}`, {
        params: { 'delete-local-db': 'true', 'delete-remote-files': 'false' },
      });
      expect(response.ok()).toBe(true);
      const deletion = await response.json();
      expect(deletion.Status).toBe('OK');
      if (deletion.ID != null) {
        await expect
          .poll(
            async () => {
              const result = await api.get(`/api/v1/task/${deletion.ID}`);
              expect(result.ok()).toBe(true);
              const state = await result.json();
              expect(state.Status, state.ErrorMessage).not.toBe('Failed');
              return state.Status;
            },
            { timeout: 30_000 }
          )
          .toBe('Completed');
      }
    };
    let recoveryOrigin: number | undefined;
    const restoreRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/restore'))
        restoreRequests.push(request.url());
    });
    try {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      if (!wizard) {
        await page.goto('/login');
        await page.getByPlaceholder('Enter your password').fill(password);
        await page.getByRole('button', { name: 'Login', exact: true }).click();
      }
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
      if (direct) {
        await deleteJob(ID);
        originalExists = false;
        await expect
          .poll(
            async () => {
              const jobs = await api.get('/api/v1/backups');
              expect(jobs.ok()).toBe(true);
              return jobs.json();
            },
            { timeout: 20_000 }
          )
          .toEqual([]);
        // Recreate the application state: no saved job or cached restore state is available.
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Backups', exact: true })).toBeVisible({ timeout: 20_000 });
      }
      await page.getByRole('link', { name: 'Restore', exact: true }).click();
      if (direct) {
        await page.locator('app-restore sh-card').filter({ hasText: 'Direct restore from backup files' }).click();
        await page.getByRole('button', { name: 'Set target URL', exact: true }).click();
        await page.locator('#targetUrl').fill(pathToFileURL(remote).href);
        await page.getByRole('button', { name: 'Override target URL', exact: true }).click();
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await page.getByRole('button', { name: 'Skip test and continue', exact: true }).click();
        const enterPassphrase = async (value: string) => {
          await page.getByPlaceholder('Enter backup passphrase if defined.', { exact: true }).fill(value);
          const createdTemporary = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
              response.request().method() === 'POST' &&
              url.pathname === '/api/v1/backups' &&
              url.searchParams.get('temporary') === 'true'
            );
          });
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          const response = await createdTemporary;
          expect(response.ok()).toBe(true);
          const settings = response.request().postDataJSON().Backup.Settings as Array<{ Name: string; Value: string }>;
          expect(settings.find((setting) => setting.Name.replace(/^--/, '') === 'passphrase')?.Value).toBe(
            value || undefined
          );
          if (!value)
            expect(settings.find((setting) => setting.Name.replace(/^--/, '') === 'no-encryption')?.Value).toBe('true');
          const temporary = await response.json();
          expect(temporary.ID).toBeTruthy();
          expect(temporary.ID).not.toBe(ID);
          temporaryIds.add(temporary.ID);
        };
        if (recovery) {
          recoveryOrigin = await page.evaluate(() => performance.timeOrigin);
          if (empty) {
            const rejected = page.waitForResponse(
              (response) =>
                response.request().method() === 'POST' &&
                new URL(response.url()).pathname === '/api/v2/backup/list-filesets'
            );
            await enterPassphrase('');
            const response = await rejected;
            const failure = await response.json();
            expect(failure.Success).toBe(false);
            expect(failure.StatusCode).toBe('EncryptedStorageNoPassphrase');
            const dialog = page
              .getByRole('dialog')
              .filter({ has: page.getByRole('heading', { name: 'Failed to load backup filesets', exact: true }) });
            await expect(dialog).toBeVisible({ timeout: 20_000 });
            expect(restoreRequests).toHaveLength(0);
            expect(await readdir(restored)).toEqual([]);
            await dialog.getByRole('button', { name: 'OK', exact: true }).click();
          } else {
            const repair = page.waitForResponse(
              (response) =>
                response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/repairupdate')
            );
            await enterPassphrase(randomUUID());
            const repairResponse = await repair;
            expect(repairResponse.ok()).toBe(true);
            const { ID: repairTask } = await repairResponse.json();
            expect(repairTask).toBeTruthy();
            const dialog = page
              .getByRole('dialog')
              .filter({ has: page.getByRole('heading', { name: 'Restore database repair failed', exact: true }) });
            await expect(dialog).toBeVisible({ timeout: 30_000 });
            const taskResponse = await api.get(`/api/v1/task/${repairTask}`);
            expect(taskResponse.ok()).toBe(true);
            const failure = await taskResponse.json();
            expect(failure.ErrorMessage || failure.Exception).toMatch(/decrypt|passphrase|password|key/i);
            expect(restoreRequests).toHaveLength(0);
            expect(await readdir(restored)).toEqual([]);
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
            await page.goBack();
          }
          await expect(page).toHaveURL(/\/restore-from-files\/(destination|encryption)$/);
          if (new URL(page.url()).pathname.endsWith('/destination')) {
            const setTarget = page.getByRole('button', { name: 'Set target URL', exact: true });
            if (await setTarget.isVisible()) {
              await setTarget.click();
              await page.locator('#targetUrl').fill(pathToFileURL(remote).href);
              await page.getByRole('button', { name: 'Override target URL', exact: true }).click();
            }
            await page.getByRole('button', { name: 'Continue', exact: true }).click();
            await page.getByRole('button', { name: 'Skip test and continue', exact: true }).click();
          }
        }
        await enterPassphrase(passphrase);
      } else {
        await page.locator('app-restore sh-card').filter({ hasText: jobName }).click();
      }
      const folder = page
        .locator('app-file-tree')
        .getByRole('treeitem')
        .filter({ has: page.locator('.text').getByText('Documents', { exact: true }) });
      await expect(folder).toBeVisible({ timeout: 20_000 });
      if (recovery) expect(await page.evaluate(() => performance.timeOrigin)).toBe(recoveryOrigin);
      await folder.press('ArrowRight');
      await expect(page.locator('app-file-tree .text').getByText('message.txt', { exact: true })).toBeVisible();
      await folder.locator('.text').getByText('Documents', { exact: true }).click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.locator('sh-radio').filter({ hasText: 'Pick location' }).click();
      await page.getByRole('button', { name: 'Manually type path', exact: true }).click();
      await page.locator('[formcontrolname=restoreFromPath]').fill(restored);
      const copied = direct
        ? page.waitForResponse(
            (response) =>
              response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/copytotemp')
          )
        : null;
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      if (copied) {
        const response = await copied;
        expect(response.ok()).toBe(true);
        const temporary = await response.json();
        expect(temporary.ID).toBeTruthy();
        temporaryIds.add(temporary.ID);
      }
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
      expect(restoreRequests).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      for (const id of [...(originalExists ? [ID] : []), ...temporaryIds]) {
        await deleteJob(id);
      }
    }
  });
}
