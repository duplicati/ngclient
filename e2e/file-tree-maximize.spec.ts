import { expect, test } from './fixtures/authenticated';

test('file tree can be maximized to fill the viewport and restored again', async ({ authenticatedPage: page }) => {
  await page.route('**/api/v1/backup/42', (route) =>
    route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Maximize test',
          Description: '',
          Sources: [],
          Settings: [{ Name: '--no-encryption', Value: 'True' }],
          TargetURL: 'file:///backup',
          Filters: [],
          Metadata: {},
          OperationType: 'Backup',
        },
        Schedule: null,
      },
    })
  );
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/filesystem*', (route) =>
    route.fulfill({
      json: [
        { id: '/Documents/', text: 'Documents', cls: 'folder', leaf: false },
        { id: '/Music/', text: 'Music', cls: 'folder', leaf: false },
        { id: '/readme.txt', text: 'readme.txt', cls: 'file', leaf: true },
      ],
    })
  );
  // Client-side navigation retains the authenticated session established by the fixture.
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/source-data');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  const tree = page.getByRole('tree', { name: 'Files and folders' });
  const documents = tree.getByRole('treeitem', { name: 'Documents', exact: true });
  await expect(documents).toBeVisible();

  const viewport = page.viewportSize()!;
  const before = (await tree.boundingBox())!;
  expect(before.width).toBeLessThan(viewport.width * 0.9);
  expect(before.height).toBeLessThan(viewport.height * 0.6);

  const maximize = page.getByRole('button', { name: 'Maximize file tree' });
  await expect(maximize).toHaveAttribute('aria-pressed', 'false');
  await maximize.click();

  const restore = page.getByRole('button', { name: 'Restore file tree size' });
  await expect(restore).toHaveAttribute('aria-pressed', 'true');
  await expect(documents).toBeVisible();

  const after = (await tree.boundingBox())!;
  // The tree fills the viewport apart from a small padding around the edges.
  expect(after.x).toBeGreaterThan(0);
  expect(after.x).toBeLessThan(48);
  expect(after.width).toBeGreaterThan(viewport.width - 2 * 48);
  expect(after.height).toBeGreaterThan(viewport.height * 0.7);
  expect(after.y + after.height).toBeLessThanOrEqual(viewport.height);

  // Escape restores the original size.
  await page.keyboard.press('Escape');
  await expect(maximize).toHaveAttribute('aria-pressed', 'false');
  const restored = (await tree.boundingBox())!;
  expect(Math.round(restored.width)).toBe(Math.round(before.width));
  expect(Math.round(restored.height)).toBe(Math.round(before.height));

  // The button toggles back as well.
  await maximize.click();
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(maximize).toHaveAttribute('aria-pressed', 'false');
});
