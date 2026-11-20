import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixture';

async function volumeHashes(directory: string) {
  return Promise.all(
    (await readdir(directory)).sort().map(async (name) => ({
      name,
      hash: createHash('sha256')
        .update(await readFile(join(directory, name)))
        .digest('hex'),
    }))
  );
}

test('deletes only the selected secondary destination', async ({ liveServer, page }) => {
  const { api, directory, password } = liveServer;
  const source = join(directory, 'source');
  const primary = join(directory, 'primary');
  const selected = join(directory, 'secondary-selected');
  const retained = join(directory, 'secondary-retained');
  await Promise.all([source, primary, selected, retained].map((path) => mkdir(path)));
  await writeFile(join(source, 'payload.txt'), 'Backup for selective deletion.');
  const name = 'Selective deletion';
  const created = await api.post('/api/v1/backups', {
    data: {
      Backup: {
        Name: name,
        TargetURL: pathToFileURL(primary).href,
        AdditionalTargetURLs: [selected, retained].map((path) => ({
          TargetUrl: pathToFileURL(path).href,
          Mode: 'inline',
        })),
        Sources: [source + sep],
        Settings: [{ Name: '--no-encryption', Value: 'true' }],
      },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { ID } = await created.json();
  const endpoint = `/api/v1/backup/${ID}`;
  const started = await api.post(`${endpoint}/start`);
  expect(started.ok(), await started.text()).toBe(true);
  const { ID: task } = await started.json();
  await expect
    .poll(async () => (await (await api.get(`/api/v1/task/${task}`)).json()).Status, { timeout: 45_000 })
    .toBe('Completed');
  const details = await api.get(endpoint);
  const { Backup } = await details.json();
  const key = Backup.AdditionalTargetURLs.find((target: { TargetUrl: string }) =>
    target.TargetUrl.includes('secondary-selected')
  ).UrlKey;
  expect(key).toBeTruthy();
  const before = await Promise.all([primary, selected, retained].map(volumeHashes));
  for (const files of before) expect(files.some(({ name }) => name.includes('.dlist.'))).toBe(true);

  await page.goto('/login');
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goto(`/backup/${ID}/delete`);
  const remote = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Delete remote files' }) });
  const checkboxes = remote.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(3);
  for (const checkbox of await checkboxes.all()) await expect(checkbox).not.toBeChecked();
  await remote.locator('sh-checkbox').filter({ hasText: 'secondary-selected' }).getByRole('checkbox').check();

  const deleteButton = page.getByRole('button', { name: 'Delete backup', exact: true });
  const dialog = page.getByRole('dialog');
  await deleteButton.click();
  await expect(dialog).toContainText('secondary-selected');
  await expect(dialog).not.toContainText('secondary-retained');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await Promise.all([primary, selected, retained].map(volumeHashes))).toEqual(before);

  const pending = page.waitForResponse(
    (response) => response.request().method() === 'DELETE' && new URL(response.url()).pathname === endpoint
  );
  await deleteButton.click();
  await dialog.getByRole('button', { name: 'Delete backup', exact: true }).click();
  const deleted = await pending;
  expect(deleted.ok(), await deleted.text()).toBe(true);
  const query = new URL(deleted.url()).searchParams;
  expect(query.getAll('remote-destinations')).toEqual([key]);
  expect(query.has('delete-remote-files')).toBe(false);
  await expect.poll(async () => (await api.get(endpoint)).status(), { timeout: 45_000 }).toBe(404);
  expect(await readdir(selected)).toEqual([]);
  expect(await volumeHashes(primary)).toEqual(before[0]);
  expect(await volumeHashes(retained)).toEqual(before[2]);
});
