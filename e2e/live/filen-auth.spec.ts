import { mkdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { test, expect } from './fixture';

test('passes the entered Filen code to authentication without retaining it after success', async ({
  page,
  liveServer,
}) => {
  const { api, directory, password } = liveServer;
  const source = join(directory, 'filen-source');
  await mkdir(source);
  const created = await api.post('/api/v1/backups', {
    data: {
      Backup: {
        Name: 'Filen authentication fixture',
        TargetURL: 'filen://archive?auth-username=fixture&auth-password=fixture-password',
        Sources: [source + sep],
        Settings: [{ Name: '--no-encryption', Value: 'true' }],
        Filters: [],
      },
      Schedule: null,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { ID: id } = await created.json();
  expect(id).toBeTruthy();
  const endpoint = `/api/v1/backup/${id}`;
  try {
    await page.route('**/api/v1/webmodule/filen-get-api-key', (route) =>
      route.fulfill({ json: { Result: { 'api-key': 'fixture-api-key' } } })
    );
    await page.goto('/login');
    await page.getByPlaceholder('Enter your password').fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.goto(`/backup/${id}/destination`);

    const code = page.getByRole('textbox', { name: /2-factor code/i });
    const authenticate = page.getByRole('button', { name: 'Authenticate now', exact: true });
    await code.fill('012345');
    const pendingAuth = page.waitForRequest('**/api/v1/webmodule/filen-get-api-key');
    await authenticate.click();
    const request = await pendingAuth;
    const body = request.postDataJSON();
    expect(body).toMatchObject({ 'filen-operation': 'GetApiKey', 'backup-id': String(id) });
    expect(new URL(body.url).searchParams.get('two-factor-code')).toBe('012345');
    await expect(code).toHaveCount(0);

    const pendingSave = page.waitForResponse(
      (response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === endpoint
    );
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const saved = await pendingSave;
    expect(saved.ok(), await saved.text()).toBe(true);
    const savedParams = new URL(saved.request().postDataJSON().Backup.TargetURL).searchParams;
    expect(savedParams.get('two-factor-code')).toBe('');
    expect(savedParams.get('api-key')).toBe('fixture-api-key');
    await page.reload();
    await expect(page.locator('app-single-destination')).toBeVisible();
    await expect(code).toHaveCount(0);
  } finally {
    const deleted = await api.delete(endpoint, {
      params: { 'delete-local-db': 'false', 'delete-remote-files': 'false' },
    });
    expect(deleted.ok(), await deleted.text()).toBe(true);
  }
});
