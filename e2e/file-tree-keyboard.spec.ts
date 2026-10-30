import { expect, test } from './fixtures/authenticated';

for (const theme of ['light', 'dark']) {
  test(
    'file tree supports keyboard navigation and visible focus in ' + theme + ' mode',
    async ({ authenticatedPage: page }) => {
      await page.route('**/api/v1/backup/42', (route) =>
        route.fulfill({
          json: {
            Backup: {
              ID: '42',
              Name: 'Keyboard test',
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
      const paths: string[] = [];
      await page.route('**/api/v1/filesystem*', async (route) => {
        const path = route.request().postDataJSON().path;
        paths.push(path);
        await route.fulfill({
          json:
            path === '/Documents/'
              ? [{ id: '/Documents/notes.txt', text: 'notes.txt', cls: 'file', leaf: true }]
              : [
                  { id: '/Documents/', text: 'Documents', cls: 'folder', leaf: false },
                  { id: '/Music/', text: 'Music', cls: 'folder', leaf: false },
                  { id: '/readme.txt', text: 'readme.txt', cls: 'file', leaf: true },
                ],
        });
      });
      // Client-side navigation retains the authenticated session established by the fixture.
      await page.evaluate(() => {
        history.pushState(null, '', '/backup/42/source-data');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      const tree = page.getByRole('tree', { name: 'Files and folders' });
      const computer = tree.getByRole('treeitem', { name: 'Computer', exact: true });
      const documents = tree.getByRole('treeitem', { name: 'Documents', exact: true });
      await expect(documents).toBeVisible();
      await page.evaluate((theme) => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
      }, theme);
      await computer.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(computer).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(documents).toBeFocused();
      await expect(documents).toHaveAttribute('aria-checked', 'false');
      const outline = await documents.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          width: parseFloat(style.outlineWidth),
          style: style.outlineStyle,
          color: style.outlineColor,
          visible: element.matches(':focus-visible'),
        };
      });
      expect(outline.visible).toBe(true);
      expect(outline.width).toBeGreaterThanOrEqual(2);
      expect(outline.style).toBe('solid');
      expect(outline.color).not.toBe('rgba(0, 0, 0, 0)');
      await page.keyboard.press('ArrowRight');
      await expect(documents).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('ArrowRight');
      await expect(tree.getByRole('treeitem', { name: 'notes.txt', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(documents).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(documents).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Space');
      await expect(documents).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('ArrowDown');
      const music = tree.getByRole('treeitem', { name: 'Music', exact: true });
      await expect(music).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(music).toHaveAttribute('aria-checked', 'true');
      await expect(documents).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Tab');
      await expect(tree.locator('[role=treeitem]:focus')).toHaveCount(0);
      await page.keyboard.press('Shift+Tab');
      await expect(music).toBeFocused();
      await music.click();
      await expect(music).toHaveAttribute('aria-checked', 'false');
      expect(paths).toEqual(['/', '/Documents/']);
    }
  );
}
