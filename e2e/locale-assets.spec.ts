import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const original = JSON.parse(
  readFileSync(join(__dirname, '../projects/ngclient/src/app/core/locales/testing/angular-locales.json'), 'utf8')
) as {
  assets: { glob: string; output: string }[];
};

test('production includes every existing translation JSON and Day.js asset', async ({ request }) => {
  const paths = original.assets.flatMap((asset) => {
    const match = asset.glob.match(/^(.*)\{([^}]+)\}(.*)$/);
    const names = match ? match[2].split(',').map((name) => match[1] + name + match[3]) : [asset.glob];
    return names.map((name) => '/' + asset.output.replace(/^\.\//, '') + name);
  });
  await Promise.all(
    paths.map(async (path) => {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      if (path.endsWith('.json')) {
        expect(response.headers()['content-type'], path).toContain('application/json');
        expect((await response.json()).translations, path).toBeInstanceOf(Object);
      } else {
        expect(response.headers()['content-type'], path).toContain('javascript');
        expect(await response.text(), path).not.toContain('<!doctype html>');
      }
    })
  );
});
