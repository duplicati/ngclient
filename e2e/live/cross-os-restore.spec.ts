import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixture';

test('lists real foreign-OS folders as expandable and directly restores their selected contents', async ({
  page,
  liveServer,
}, testInfo) => {
  test.setTimeout(180_000);
  const { api, directory, password } = liveServer;
  const infoResponse = await api.get('/api/v1/systeminfo');
  expect(infoResponse.ok()).toBe(true);
  const info = await infoResponse.json();
  const sourceOS = info.DirectorySeparator === '\\' ? 'linux' : 'windows';
  expect(['/', '\\']).toContain(info.DirectorySeparator);
  const remote = join(directory, 'foreign-remote'),
    restored = join(directory, 'foreign-restored');
  const manifest = JSON.parse(await readFile(resolve('e2e/fixtures/cross-os/manifest.json'), 'utf8')) as Array<{
    Path: string;
    Sha256: string;
  }>;
  const fixtures = manifest.filter((x) => x.Path.startsWith(sourceOS + '/'));
  expect(fixtures).toHaveLength(3);
  for (const entry of fixtures) {
    const bytes = await readFile(resolve('e2e/fixtures/cross-os', entry.Path));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.Sha256);
  }
  await cp(resolve('e2e/fixtures/cross-os', sourceOS), remote, { recursive: true });
  await mkdir(restored);
  const temporary = await api.post('/api/v1/backups', {
    params: { temporary: 'true' },
    data: {
      Backup: {
        TargetURL: pathToFileURL(remote).href,
        Settings: [{ Name: '--no-encryption', Value: 'true' }],
      },
    },
  });
  expect(temporary.ok(), await temporary.text()).toBe(true);
  const { ID: id } = await temporary.json();
  expect(id).toBeTruthy();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const listings: Array<{ Paths: string[] | null }> = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/v2/backup/list-folder')
      listings.push(r.postDataJSON());
  });
  try {
    await page.goto('/login');
    await page.getByPlaceholder('Enter your password').fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.goto(`/restore-draft/${id}/select-files`);
    const row = (label: string) =>
      page
        .locator('app-file-tree')
        .getByRole('treeitem')
        .filter({ has: page.locator('.text').getByText(label, { exact: true }) });
    const folder = row('Documents');
    await expect(folder).toBeVisible({ timeout: 30_000 });
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await expect(row('peer.txt')).not.toHaveAttribute('aria-expanded');
    const pending = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/v2/backup/list-folder' &&
        r
          .request()
          .postDataJSON()
          .Paths?.some((p: string) => /Documents[\\/]$/.test(p))
    );
    await folder.press('ArrowRight');
    const listing = await (await pending).json();
    expect(listing.Success).toBe(true);
    expect(
      listing.Data.some((x: { Path: string; IsDirectory: boolean }) => x.Path.endsWith('payload.txt') && !x.IsDirectory)
    ).toBe(true);
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await expect(row('payload.txt')).toBeVisible();
    await expect(row('payload.txt')).not.toHaveAttribute('aria-expanded');
    const folderPath = listings.flatMap((x) => x.Paths ?? []).find((p) => /Documents[\\/]$/.test(p));
    expect(folderPath).toBeTruthy();
    expect(folderPath!.includes(info.DirectorySeparator === '\\' ? '/' : '\\')).toBe(true);
    await folder.locator('.text').getByText('Documents', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.locator('sh-radio').filter({ hasText: 'Pick location' }).click();
    await page.getByRole('button', { name: 'Manually type path', exact: true }).click();
    await page.locator('[formcontrolname=restoreFromPath]').fill(restored);
    const sent = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/restore'));
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    const body = (await sent).postDataJSON();
    expect(body.paths).toEqual([folderPath + '*']);
    await expect(page.locator('sh-card').filter({ hasText: 'Restore completed' })).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.complete-success')).toBeVisible();
    const files = (await readdir(restored, { recursive: true, withFileTypes: true })).filter((x) => x.isFile());
    expect(files.map((x) => x.name)).toEqual(['payload.txt']);
    expect(await readFile(join(files[0].parentPath, files[0].name), 'utf8')).toBe(`${sourceOS} payload\n`);
    expect(errors).toEqual([]);
    const evidence = testInfo.outputPath('cross-os-results.json');
    await writeFile(
      evidence,
      JSON.stringify(
        {
          sourceOS,
          serverOS: info.OSType,
          runtime: info.CLRVersion,
          version: info.ServerVersionName,
          browser: page.context().browser()?.version(),
          folderPath,
          restorePaths: body.paths,
          files: files.map((x) => x.name),
          errors,
        },
        null,
        2
      )
    );
    await testInfo.attach('cross-os-results', {
      contentType: 'application/json',
      path: evidence,
    });
  } finally {
    expect(
      (
        await api.delete(`/api/v1/backup/${id}`, {
          params: { 'delete-local-db': 'true', 'delete-remote-files': 'false' },
        })
      ).ok()
    ).toBe(true);
  }
});
