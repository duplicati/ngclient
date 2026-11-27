import { expect, test } from './fixtures/authenticated';

test.use({
  initialServerSettings: { 'enable-mcp-server': 'True' },
  extraApiExtensions: ['v2:mcp:server'],
});

test('confirms disabling the MCP server and restores the toggle when cancelled', async ({
  authenticatedPage: page,
  serverApi,
}) => {
  await page.route('**/api/v2/mcp/tokens', (route) =>
    route.fulfill({
      json: { Success: true, Data: [{ Id: 'fixture', Name: 'Fixture token', Level: 'Read' }] },
    })
  );
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Fixture token', { exact: true })).toBeVisible();
  const toggle = page.locator('#mcp-server');
  const dialog = page.getByRole('heading', { name: 'Turn off the MCP server', exact: true });
  await expect(toggle).toBeChecked();
  await page.locator('label[for=mcp-server]').click();
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(toggle).toBeChecked();
  expect(serverApi.settingsRequests).toHaveLength(0);

  await toggle.press('Space');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Turn off and delete tokens', exact: true }).click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
  expect(serverApi.settingsRequests[0].request().postDataJSON()).toEqual({ 'enable-mcp-server': 'False' });
  await serverApi.settingsRequests[0].fulfill({ status: 200, json: {} });
  await expect(toggle).not.toBeChecked();
});
