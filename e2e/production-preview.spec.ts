import { expect, test } from '@playwright/test';

test('serves the production preview and keeps backend routes out of the SPA fallback', async ({ request }) => {
  const login = await request.get('/login');
  expect(login.ok()).toBe(true);
  expect(login.headers()['content-type']).toContain('text/html');
  const html = await login.text();
  const deepLink = await request.get('/backup/42/schedule');
  expect(deepLink.ok()).toBe(true);
  expect(await deepLink.text()).toBe(html);

  const script = html.match(/src="(main-[^"]+\.js)"/)?.[1];
  expect(script).toBeDefined();
  const asset = await request.get('/' + script);
  expect(asset.ok()).toBe(true);
  expect(asset.headers()['content-type']).toContain('javascript');
  const bytes = await asset.body();
  const head = await request.head('/' + script);
  expect(head.ok()).toBe(true);
  expect(head.headers()['content-length']).toBe(String(bytes.length));
  expect(await head.body()).toHaveLength(0);
  const range = await request.get('/' + script, { headers: { Range: 'bytes=1-9' } });
  expect(range.status()).toBe(206);
  expect(await range.body()).toEqual(bytes.subarray(1, 10));

  for (const path of ['/missing.js', '/api/v1/systeminfo', '/notifications']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
