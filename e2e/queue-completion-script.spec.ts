import { expect, test } from './fixtures/authenticated';

test.use({
  initialServerSettings: { 'post-queue-processing-script': '/opt/backup/old-script' },
  extraApiExtensions: ['v1:serverstate:queue-completion-action'],
});

test('loads and saves the queue completion script path', async ({ authenticatedPage: page, serverApi }) => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const script = page.getByRole('textbox', { name: 'Script path', exact: true });
  await expect(script).toHaveValue('/opt/backup/old-script');
  expect(serverApi.settingsRequests).toHaveLength(0);

  const updated = '/opt/backup/new script';
  await script.fill(updated);
  const save = page.getByRole('button', { name: 'Update script', exact: true });
  await save.click();
  await expect.poll(() => serverApi.settingsRequests.length).toBe(1);
  const route = serverApi.settingsRequests[0];
  expect(route.request().postDataJSON()).toEqual({ 'post-queue-processing-script': updated });
  await expect(save).toBeDisabled();
  await route.fulfill({ status: 200, json: {} });
  await expect(save).toBeEnabled();
  await expect(script).toHaveValue(updated);
});
