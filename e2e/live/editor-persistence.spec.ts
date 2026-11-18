import { mkdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixture';

test('saves in place from all five existing-job pages and retains settings after reload', async ({
  page,
  liveServer,
}, testInfo) => {
  const { api, directory, password } = liveServer;
  const source = join(directory, 'source'),
    remote = join(directory, 'remote');
  await mkdir(source);
  await mkdir(remote);
  await writeFile(join(source, 'sample.txt'), 'No backup task is run by this test.');
  const created = await api.post('/api/v1/backups', {
    data: {
      Backup: {
        Name: 'Live editor persistence',
        Description: 'Original description',
        TargetURL: pathToFileURL(remote).href,
        Sources: [source + sep],
        Settings: [
          { Name: '--no-encryption', Value: 'true' },
          { Name: '--dry-run', Value: 'false' },
          { Name: '--exclude-files-attributes', Value: 'Hidden,System' },
        ],
        Filters: [],
        Tags: [],
        Metadata: {},
      },
      Schedule: null,
    },
  });
  expect(created.ok()).toBe(true);
  const { ID } = await created.json();
  expect(ID).toBeTruthy();
  try {
    const original = await (await api.get(`/api/v1/backup/${ID}`)).json();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/login');
    await page.getByPlaceholder('Enter your password').fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL('/', { timeout: 20_000 });
    await page
      .locator('.backups .backup')
      .filter({ hasText: 'Live editor persistence' })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    await page.getByPlaceholder('Your backup description').fill('Saved through the real server');
    const saves: string[] = [];
    for (const [label, step] of [
      ['Options', 'options'],
      ['Schedule', 'schedule'],
      ['Destination', 'destination'],
      ['Source Data', 'source-data'],
      ['General', 'general'],
    ]) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(`/backup/${ID}/${step}`);
      const save = page.getByRole('button', { name: 'Save changes', exact: true });
      await expect(save).toBeEnabled();
      const pending = page.waitForResponse(
        (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/v1/backup/${ID}`
      );
      if (step === 'schedule') await save.press('Enter');
      else await save.click();
      const response = await pending;
      expect(response.ok(), await response.text()).toBe(true);
      await expect(page.getByRole('status').filter({ hasText: 'Backup settings saved.' })).toBeVisible();
      await expect(page).toHaveURL(`/backup/${ID}/${step}`);
      const storedResponse = await api.get(`/api/v1/backup/${ID}`);
      expect(storedResponse.ok()).toBe(true);
      const stored = await storedResponse.json();
      expect(stored.Backup.Description).toBe('Saved through the real server');
      expect(stored.Backup.TargetURL).toBe(original.Backup.TargetURL);
      expect(stored.Backup.Sources).toEqual(original.Backup.Sources);
      for (const name of ['dry-run', 'exclude-files-attributes']) {
        const value = (settings: Array<{ Name: string; Value: string }>) =>
          settings.find((x) => x.Name.replace(/^--/, '') === name)?.Value;
        expect(value(stored.Backup.Settings)).toBe(value(original.Backup.Settings));
      }
      await page.reload();
      await expect(save).toBeEnabled();
      await expect(page).toHaveURL(`/backup/${ID}/${step}`);
      saves.push(step);
    }
    await expect(page.getByPlaceholder('Your backup description')).toHaveValue('Saved through the real server');
    expect(saves).toEqual(['options', 'schedule', 'destination', 'source-data', 'general']);
    expect(errors).toEqual([]);
    const info = await (await api.get('/api/v1/systeminfo')).json();
    await testInfo.attach('server-version', {
      body: String(info.ServerVersionName ?? info.ServerVersion),
      contentType: 'text/plain',
    });
  } finally {
    const deleted = await api.delete(`/api/v1/backup/${ID}`, {
      params: { 'delete-local-db': 'false', 'delete-remote-files': 'false' },
    });
    expect(deleted.ok()).toBe(true);
  }
});
