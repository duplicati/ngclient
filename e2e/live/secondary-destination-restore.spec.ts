import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from './fixture';

test('lists and restores the version present at a secondary destination', async ({ liveServer, page }) => {
  test.setTimeout(180_000);
  const { api, directory, password } = liveServer;
  const source = join(directory, 'secondary-restore-source');
  const primary = join(directory, 'secondary-restore-primary');
  const secondary = join(directory, 'secondary-restore-secondary');
  const output = join(directory, 'secondary-restore-output');
  await Promise.all([source, primary, secondary, output].map((path) => mkdir(path)));
  const filename = 'secondary-version.txt';
  const name = 'Secondary destination restore';
  const created = await api.post('/api/v1/backups', {
    data: {
      Backup: {
        Name: name,
        TargetURL: pathToFileURL(primary).href,
        AdditionalTargetURLs: [{ TargetUrl: pathToFileURL(secondary).href, Mode: 'interval', Interval: '7D' }],
        Sources: [source + sep],
        Settings: [{ Name: '--no-encryption', Value: 'true' }],
        Filters: [],
        Tags: [],
      },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { ID } = await created.json();
  const backup = async (contents: string) => {
    await writeFile(join(source, filename), contents);
    const start = await api.post(`/api/v1/backup/${ID}/start`);
    expect(start.ok(), await start.text()).toBe(true);
    const { ID: taskId } = await start.json();
    await expect
      .poll(
        async () => {
          const response = await api.get(`/api/v1/task/${taskId}`);
          const task = await response.json();
          expect(task.Status, task.ErrorMessage).not.toBe('Failed');
          return task.Status;
        },
        { timeout: 45_000 }
      )
      .toBe('Completed');
  };
  await backup('older copy at the secondary destination');
  await expect.poll(async () => (await readdir(secondary)).filter((file) => file.includes('.dlist.')).length).toBe(1);
  await backup('newer copy at the primary destination');
  const primaryVersions = await api.post('/api/v2/backup/list-filesets', { data: { BackupId: ID } });
  const { Data: primaryFilesets } = await primaryVersions.json();
  expect(primaryFilesets).toHaveLength(2);
  expect((await readdir(secondary)).filter((file) => file.includes('.dlist.'))).toHaveLength(1);
  const status = await api.get('/api/v1/systeminfo');
  expect((await status.json()).APIExtensions).toContain('v1:backup:copytotemp-destination');
  const job = await api.get(`/api/v1/backup/${ID}`);
  const destinationKey = (await job.json()).Backup.AdditionalTargetURLs?.[0]?.UrlKey;
  expect(destinationKey).toBeTruthy();

  await page.goto('/login');
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: 'Restore', exact: true }).click();
  await page.getByText(`Restore ${name} from a secondary destination`, { exact: true }).click({ timeout: 10_000 });
  const copied = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/copytotemp'));
  await page.getByRole('button', { name: /^Secondary destination 1/ }).click();
  const copyResponse = await copied;
  expect(copyResponse.ok(), await copyResponse.text()).toBe(true);
  expect(new URL(copyResponse.url()).searchParams.get('destination')).toBe(destinationKey);
  await expect(page).toHaveURL(/\/restore-draft\/[^/]+\/select-files$/);
  await page.locator('app-select-files sh-select').click();
  await expect(page.locator('li.option')).toHaveCount(1);
  await page.locator('li.option').click();
  await page.getByText(filename, { exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('sh-radio').filter({ hasText: 'Pick location' }).click();
  await page.getByRole('button', { name: 'Manually type path', exact: true }).click();
  await page.locator('[formcontrolname=restoreFromPath]').fill(output);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('sh-card').filter({ hasText: 'Restore completed' })).toBeVisible({ timeout: 60_000 });
  const files = await readdir(output, { recursive: true, withFileTypes: true });
  const restored = files.find((file) => file.isFile() && file.name === filename)!;
  expect(await readFile(join(restored.parentPath, restored.name), 'utf8')).toBe(
    'older copy at the secondary destination'
  );
});
