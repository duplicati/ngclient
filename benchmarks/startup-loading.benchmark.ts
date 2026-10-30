import { writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { test, expect } from '../e2e/fixtures/authenticated';

const profile = { latency: 80, downloadThroughput: 750_000, uploadThroughput: 250_000 };
const rounds = Number(process.env['STARTUP_ROUNDS'] ?? 5);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 9) throw new Error('STARTUP_ROUNDS must be between 1 and 9');
const variants = (process.env['STARTUP_VARIANTS'] ?? 'baseline,candidate').split(',');
if (variants.some((variant) => variant !== 'baseline' && variant !== 'candidate'))
  throw new Error('Invalid STARTUP_VARIANTS');

for (let sample = 1; sample <= rounds; sample++)
  for (const variant of variants) {
    test(variant + ' sample ' + sample, async ({ page, serverApi, request, browser }, info) => {
      expect((await request.post('/__benchmark/build', { data: { variant } })).ok()).toBe(true);
      await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
      await page.route('**/api/v1/backup/42', (route) =>
        route.fulfill({
          json: {
            Backup: {
              ID: '42',
              Name: 'Measurement backup',
              Description: '',
              Sources: ['/source/'],
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
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile });
      const active = new Set<string>();
      const records = new Map<string, { url: string; type: string; bytes: number; status?: number }>();
      let lastActivity = Date.now();
      const staticUrl = (url: string) => {
        const value = new URL(url);
        return value.origin === 'http://127.0.0.1:3001' && !/^\/(api|notifications|__benchmark)/.test(value.pathname);
      };
      cdp.on('Network.requestWillBeSent', (event) => {
        if (!staticUrl(event.request.url)) return;
        records.set(event.requestId, {
          url: new URL(event.request.url).pathname,
          type: event.type ?? 'Other',
          bytes: 0,
        });
        active.add(event.requestId);
        lastActivity = Date.now();
      });
      cdp.on('Network.responseReceived', (event) => {
        const entry = records.get(event.requestId);
        if (entry) entry.status = event.response.status;
      });
      cdp.on('Network.loadingFinished', (event) => {
        const entry = records.get(event.requestId);
        if (!entry) return;
        entry.bytes = event.encodedDataLength;
        active.delete(event.requestId);
        lastActivity = Date.now();
      });
      cdp.on('Network.loadingFailed', (event) => {
        if (!records.has(event.requestId)) return;
        active.delete(event.requestId);
        lastActivity = Date.now();
      });
      let apiRequests = 0;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests++;
      });
      const stages: unknown[] = [];
      const capture = async (name: string, start: number) => {
        const readyMs = performance.now() - start;
        // Fixed observation window catches idle-scheduled preload work; pending static
        // transfers then settle independently of long-poll and WebSocket connections.
        await page.waitForTimeout(2000);
        await expect.poll(() => active.size === 0 && Date.now() - lastActivity > 350, { timeout: 30_000 }).toBe(true);
        const entries = [...records.values()];
        stages.push({
          name,
          readyMs,
          requests: entries.length,
          bytes: entries.reduce((sum, item) => sum + item.bytes, 0),
          scriptRequests: entries.filter((item) => item.type === 'Script').length,
          scriptBytes: entries.filter((item) => item.type === 'Script').reduce((sum, item) => sum + item.bytes, 0),
          apiRequests,
          fcpMs: await page.evaluate(
            () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null
          ),
          resources: entries,
        });
      };
      let start = performance.now();
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
      await capture('login', start);

      await page.getByPlaceholder('Enter your password').fill('measurement-password');
      start = performance.now();
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect.poll(() => serverApi.loginRequests.length).toBe(1);
      await serverApi.loginRequests[0].fulfill({
        json: { AccessToken: 'measurement-token', RefreshNonce: 'measurement-nonce' },
      });
      await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
      await expect.poll(() => serverApi.socketTokens).toEqual(['measurement-token']);
      await capture('home', start);

      start = performance.now();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page).toHaveURL('/settings');
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
      await capture('settings', start);

      start = performance.now();
      await page.getByRole('button', { name: 'Restore', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Where do you want to restore from?', exact: true })
      ).toBeVisible();
      await capture('restore', start);

      start = performance.now();
      await page.evaluate(() => {
        history.pushState(null, '', '/backup/42/general');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await expect(page.getByPlaceholder('Your backup name')).toHaveValue('Measurement backup');
      await capture('edit', start);
      await page.getByRole('button', { name: 'Home', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'My backups', exact: true })).toBeVisible();
      const result = {
        variant,
        sample,
        profile,
        cache: 'disabled; fresh context per sample',
        browser: browser.version(),
        platform: process.platform,
        cpu: cpus()[0].model,
        memoryGiB: totalmem() / 1024 ** 3,
        stages,
      };
      writeFileSync(info.outputPath('startup.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ variant, sample, stages: stages.map(({ resources, ...stage }: any) => stage) }));
    });
  }
