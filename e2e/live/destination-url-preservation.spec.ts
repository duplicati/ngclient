import { mkdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { GetBackupResultDto } from '../../projects/ngclient/src/app/core/openapi';
import { test, expect } from './fixture';

const cases = [
  ['file', 'file://C:/Backup%20Files?future=a+b&future=two&flag&empty='],
  [
    'ssh',
    'ssh://fixture-user:fixture-secret@Example.COM:022/archive%2fpart?auth-password=p%2525&buffer-size=64MB&future=a+b&future=two&flag&empty=',
  ],
  [
    'webdav',
    'webdavs://Example.COM/archive%2fpart?auth-username=fixture-user&auth-password=fixture%2525secret&future=a+b&future=two&flag&empty=',
  ],
  [
    's3',
    's3://BucketName/archive?s3-server-name=s3.example.invalid&auth-password=fixture-secret&future=a+b&future=two&flag&empty=',
  ],
  ['pcloud', 'pcloud://api.pcloud.com/Folder?authid=fixture-authid&future=a+b&future=two&flag&empty='],
  ['unsupported', 'future-backend://example.invalid/archive?future=a+b&future=two&flag&empty='],
  [
    'ftp-encoding',
    'ftp://Example.COM/a%2Fb%20c?auth-username=u&empty=&plus=a+b&space=a%20b&double=%2520&auth-password=x%26y%3D&flag&dup=1&dup=2',
  ],
  ['interleaved-secrets', 's3://bucket/a%2Fb?AUTH-PASSWORD=one&keep=middle&auth-password=two&flag'],
  ['unparseable', 'ssh://undefined/path?future=a+b&future=two&empty=&flag'],
] as const;

const settings = [
  { Name: '--no-encryption', Value: 'true' },
  { Name: '--retry-delay', Value: '13s' },
  { Name: '--fixture-option', Value: ' preserve + % and spaces ' },
  { Name: '--fixture-empty', Value: '' },
  { Name: '--exclude-files-attributes', Value: 'Hidden,System' },
  { Name: '--dry-run', Value: 'false' },
];

function advancedOptions(job: GetBackupResultDto) {
  return job
    .Backup!.Settings!.filter(
      (option) => option.Name !== '--no-encryption' && settings.some(({ Name }) => Name === option.Name)
    )
    .map(({ Name, Value }) => ({ Name, Value }))
    .sort((a, b) => a.Name!.localeCompare(b.Name!));
}

for (const [label, url] of cases) {
  test(`${label}: API and untouched editor saves retain the exact destination and advanced options`, async ({
    page,
    liveServer,
  }, testInfo) => {
    const { api, directory, password } = liveServer;
    const source = join(directory, `source-${label}`);
    await mkdir(source);
    const created = await api.post('/api/v1/backups', {
      data: {
        Backup: {
          Name: `Destination preservation ${label}`,
          Description: 'Original description',
          TargetURL: url,
          Sources: [source + sep],
          Settings: settings,
          Filters: [],
          Tags: [],
          Metadata: {},
        },
        Schedule: null,
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const { ID: id } = await created.json();
    expect(id).toBeTruthy();
    const endpoint = `/api/v1/backup/${id}`;
    // GET masks credentials; inspect only the disposable server's DB to prove
    // their values and the original URL spelling survive an unchanged PUT.
    const storedUrl = () => {
      const db = new DatabaseSync(join(directory, 'data', 'Duplicati-server.sqlite'), { readOnly: true });
      try {
        return db.prepare('SELECT TargetURL FROM Backup WHERE ID=?').get(Number(id))!.TargetURL;
      } finally {
        db.close();
      }
    };
    const get = async (): Promise<GetBackupResultDto> => {
      const response = await api.get(endpoint);
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    try {
      const initial = await get();
      const expectedOptions = advancedOptions(initial);
      expect(expectedOptions).toHaveLength(settings.length - 1);
      expect(storedUrl()).toBe(url);
      const saved = await api.put(endpoint, { data: initial });
      expect(saved.ok(), await saved.text()).toBe(true);
      expect(storedUrl()).toBe(url);
      expect(advancedOptions(await get())).toEqual(expectedOptions);

      const writes: GetBackupResultDto[] = [];
      const unexpected: string[] = [];
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (request.method() === 'PUT' && path === endpoint) writes.push(request.postDataJSON());
        if (request.method() === 'POST' && /\/(start|test)$/.test(path)) unexpected.push(path);
      });
      await page.goto('/login');
      await page.getByPlaceholder('Enter your password').fill(password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL('/');
      await page.goto(`/backup/${id}/destination`);
      const save = page.getByRole('button', { name: 'Save changes', exact: true });
      await expect(save).toBeEnabled();
      await expect(page.locator('app-single-destination')).toBeVisible();
      if (label === 'unparseable') {
        await expect(
          page.getByText('The destination URL could not be read into the fields below', { exact: false })
        ).toBeVisible();
      }
      // Allow the form's initial render/effects to run, without editing anything.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(writes).toHaveLength(0);
      expect(storedUrl()).toBe(url);

      const actions: string[] = [];
      for (const action of ['mouse', 'reload-keyboard', 'description-only']) {
        if (action === 'reload-keyboard') {
          await page.reload();
          await expect(save).toBeEnabled();
        } else if (action === 'description-only') {
          await page.getByRole('link', { name: 'General', exact: true }).click();
          await page.getByPlaceholder('Your backup description').fill('Changed without editing the destination');
        }
        expect(writes).toHaveLength(actions.length);
        const before = await get();
        const pending = page.waitForResponse(
          (response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === endpoint
        );
        if (action === 'reload-keyboard') await save.press('Enter');
        else await save.click();
        const response = await pending;
        expect(response.ok(), await response.text()).toBe(true);
        const body: GetBackupResultDto = response.request().postDataJSON();
        expect(body.Backup!.TargetURL).toBe(before.Backup!.TargetURL);
        expect(advancedOptions(body)).toEqual(expectedOptions);
        expect(storedUrl()).toBe(url);
        const after = await get();
        expect(advancedOptions(after)).toEqual(expectedOptions);
        // The server may normalize the boolean's casing; preserve its meaning.
        for (const job of [body, after]) {
          expect(
            String(job.Backup!.Settings!.find(({ Name }) => Name === '--no-encryption')?.Value).toLowerCase()
          ).toBe('true');
        }
        await expect(page.getByRole('status').filter({ hasText: 'Backup settings saved.' })).toBeVisible();
        await expect(save).toBeEnabled();
        actions.push(action);
      }
      await page.reload();
      await expect(page.getByPlaceholder('Your backup description')).toHaveValue(
        'Changed without editing the destination'
      );
      expect(storedUrl()).toBe(url);
      expect(writes).toHaveLength(3);
      if (label === 'ssh') {
        await page.goto(`/backup/${id}/destination`);
        const server = page.locator('app-single-destination').getByRole('textbox', { name: /^Server\b/ });
        await expect(server).toHaveValue('Example.COM');
        await server.fill('edited.example.invalid');
        const pending = page.waitForResponse(
          (response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === endpoint
        );
        await save.click();
        const response = await pending;
        expect(response.ok(), await response.text()).toBe(true);
        expect(storedUrl()).toBe(url.replace('Example.COM', 'edited.example.invalid'));
        expect(advancedOptions(await get())).toEqual(expectedOptions);
        await page.reload();
        await expect(server).toHaveValue('edited.example.invalid');
        expect(writes).toHaveLength(4);
        actions.push('edit-ssh-server-and-reload');
      }
      expect(unexpected).toEqual([]);
      expect(errors).toEqual([]);
      const info = await (await api.get('/api/v1/systeminfo')).json();
      await testInfo.attach('destination-preservation', {
        body: JSON.stringify(
          {
            label,
            actions,
            writes: writes.length,
            exactStoredUrlPreserved: true,
            advancedOptionsPreserved: true,
            unexpected,
            errors,
            serverVersion: info.ServerVersionName,
            runtime: info.CLRVersion,
          },
          null,
          2
        ),
        contentType: 'application/json',
      });
      if (label === 'pcloud') {
        await page.goto(`/backup/${id}/destination`);
        const region = page.locator('app-single-destination select').filter({
          has: page.locator('option[value="api.pcloud.com"]'),
        });
        await expect(region).toHaveValue('api.pcloud.com');
        await region.selectOption('eapi.pcloud.com');
        const pending = page.waitForResponse(
          (response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === endpoint
        );
        await save.click();
        const response = await pending;
        expect(response.ok(), await response.text()).toBe(true);
        expect(storedUrl()).toBe(url.replace('api.pcloud.com', 'eapi.pcloud.com'));
        expect(advancedOptions(await get())).toEqual(expectedOptions);
        await page.reload();
        await expect(region).toHaveValue('eapi.pcloud.com');
        expect(writes).toHaveLength(4);
        expect(unexpected).toEqual([]);
        expect(errors).toEqual([]);
      }
    } finally {
      const deleted = await api.delete(endpoint, {
        params: { 'delete-local-db': 'false', 'delete-remote-files': 'false' },
      });
      expect(deleted.ok(), await deleted.text()).toBe(true);
    }
  });
}
