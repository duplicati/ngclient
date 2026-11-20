import { expect, test } from './fixtures/authenticated';

test.use({
  initialServerSettings: {
    'server-listen-interface': 'any',
    'allowed-hostnames': 'backup.example.test',
  },
});

test('loads and saves allowed hostnames', async ({ authenticatedPage: page, serverApi }) => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const hostnames = page.getByRole('textbox', { name: 'Allowed hostnames', exact: true });
  await expect(hostnames).toHaveValue('backup.example.test');
  expect(serverApi.settingsRequests).toHaveLength(0);

  for (const value of ['backup.example.test;restore.example.test', '']) {
    await hostnames.fill(value);
    await page.getByRole('button', { name: 'Update allowed hostnames', exact: true }).click();
    await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
    const route = serverApi.settingsRequests[0];
    const request = route.request();
    expect(request.postDataJSON()).toEqual({ 'allowed-hostnames': value });
    const response = page.waitForResponse((candidate) => candidate.request() === request);
    await route.fulfill({ status: 200, json: {} });
    expect((await response).ok()).toBe(true);
    await expect(hostnames).toHaveValue(value);
    serverApi.settingsRequests.length = 0;
  }
});
