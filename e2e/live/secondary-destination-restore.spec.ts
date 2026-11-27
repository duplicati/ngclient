import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from './fixture';

type Fixtures = Parameters<Parameters<typeof test>[2]>[0];

/** Makes a job whose secondary destination holds only the older of its two versions, and signs in */
async function prepare({ liveServer, page }: Pick<Fixtures, 'liveServer' | 'page'>, prefix: string) {
  const { api, directory, password } = liveServer;
  const source = join(directory, `${prefix}-source`);
  const primary = join(directory, `${prefix}-primary`);
  const secondary = join(directory, `${prefix}-secondary`);
  const output = join(directory, `${prefix}-output`);
  await Promise.all([source, primary, secondary, output].map((path) => mkdir(path)));
  const filename = 'secondary-version.txt';
  const name = `Secondary destination restore ${prefix}`;
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
  return { name, filename, output, destinationKey };
}

const expectOlderCopyRestored = async (page: Fixtures['page'], output: string, filename: string) => {
  await expect(page.locator('sh-card').filter({ hasText: 'Restore completed' })).toBeVisible({ timeout: 60_000 });
  const files = await readdir(output, { recursive: true, withFileTypes: true });
  const restored = files.find((file) => file.isFile() && file.name === filename)!;
  expect(await readFile(join(restored.parentPath, restored.name), 'utf8')).toBe(
    'older copy at the secondary destination'
  );
};

test('restores a version from a secondary destination chosen in the restore options', async ({ liveServer, page }) => {
  test.setTimeout(180_000);
  const { name, filename, output, destinationKey } = await prepare({ liveServer, page }, 'options');
  await page.getByRole('link', { name: 'Restore', exact: true }).click();
  await page.locator('sh-card').filter({ hasText: name }).click();
  await expect(page).toHaveURL(/\/restore\/[^/]+\/select-files$/);
  // The versions are those of the primary destination; the older one is also at the secondary destination
  await page.locator('app-select-files sh-select').click();
  await expect(page.locator('li.option')).toHaveCount(2);
  await page.locator('li.option').last().click();
  await page.getByText(filename, { exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('sh-radio').filter({ hasText: 'Secondary destination' }).click();
  await page.locator('sh-radio').filter({ hasText: 'Pick location' }).click();
  await page.getByRole('button', { name: 'Manually type path', exact: true }).click();
  await page.locator('[formcontrolname=restoreFromPath]').fill(output);
  const copied = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/copytotemp'));
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  const copyResponse = await copied;
  expect(copyResponse.ok(), await copyResponse.text()).toBe(true);
  expect(new URL(copyResponse.url()).searchParams.get('destination')).toBe(destinationKey);
  await expectOlderCopyRestored(page, output, filename);
});

test('lists and restores the version present at a secondary destination picked on the overview', async ({
  liveServer,
  page,
}) => {
  test.setTimeout(180_000);
  const { name, filename, output, destinationKey } = await prepare({ liveServer, page }, 'overview');
  // Wide enough that the menu would also fit to the right of the caret
  await page.setViewportSize({ width: 2200, height: 900 });
  await page.getByRole('link', { name: 'Restore', exact: true }).click();
  const card = page.locator('sh-card').filter({ hasText: name });
  const trigger = card.locator('sh-menu.secondary-menu button[shButton]');
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  const restoreButton = card.getByRole('button', { name: 'Restore', exact: true });
  const [caretBox, restoreBox] = [(await trigger.boundingBox())!, (await restoreButton.boundingBox())!];
  // The caret is the right-hand part of the Restore button
  expect(caretBox.height).toBe(restoreBox.height);
  expect(caretBox.y).toBe(restoreBox.y);
  expect(Math.abs(caretBox.x - (restoreBox.x + restoreBox.width))).toBeLessThanOrEqual(1);
  await trigger.click();
  const item = page.getByRole('button', { name: /^Local — / });
  const header = page.getByText('Restore from a secondary destination', { exact: true });
  const menuBox = (await page.locator('sh-menu.secondary-menu .popover-content').boundingBox())!;
  // The menu ends at the right edge of the button, and its heading is smaller than, and starts with, its rows
  expect(Math.abs(menuBox.x + menuBox.width - (caretBox.x + caretBox.width))).toBeLessThanOrEqual(1);
  const textLeft = (locator: typeof item) =>
    locator.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().left;
    });
  expect(Math.abs((await textLeft(header)) - (await textLeft(item)))).toBeLessThanOrEqual(1);
  const fontSize = (locator: typeof item) =>
    locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(await fontSize(header)).toBeLessThan(await fontSize(item));
  const copied = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/copytotemp'));
  await item.click();
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
  await expectOlderCopyRestored(page, output, filename);
});
