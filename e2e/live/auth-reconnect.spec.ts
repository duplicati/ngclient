import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixture';

for (const mode of ['websocket', 'longpoll'] as const) {
  const scenarioTest = test.extend({
    liveServerOptions: [{ shortAccessTokens: true, disableWebSocket: mode === 'longpoll' }, { scope: 'worker' }],
  });
  scenarioTest.describe(mode, () => {
    for (const transient of [false, true]) {
      scenarioTest(
        `recovers from real token expiry${transient ? ' and one failed refresh' : ''} without reloading`,
        async ({ page, liveServer }, testInfo) => {
          test.setTimeout(180_000);
          const { api, password } = liveServer;
          const errors: string[] = [];
          const refreshes: number[] = [];
          let longpollRequests = 0;
          const polls: Array<{ status: number; longpoll: boolean }> = [];
          const frames: Array<{ socket: number; type?: string; service?: string; success?: boolean }> = [];
          let socketCount = 0;
          let injected = false;
          const adminHeaders = async () => {
            // The fixture's initial access token expires too. Do not reuse it for
            // the control requests that change server state after expiry.
            const login = await api.post('/api/v1/auth/login', { data: { Password: password, RememberMe: false } });
            expect(login.ok()).toBe(true);
            return { Authorization: `Bearer ${(await login.json()).AccessToken}` };
          };
          const state = async (action: 'pause' | 'resume') => {
            const response = await api.post(`/api/v1/serverstate/${action}`, { headers: await adminHeaders() });
            expect(response.ok(), await response.text()).toBe(true);
          };
          const infoResponse = await api.get('/api/v1/systeminfo', { headers: await adminHeaders() });
          expect(infoResponse.ok()).toBe(true);
          const info = await infoResponse.json();
          expect(info.APIExtensions.includes('v1:websocket')).toBe(mode === 'websocket');
          await state('resume');
          await page.addInitScript(() => {
            const state = window as unknown as Window & { authTestCloseCodes: number[] };
            state.authTestCloseCodes = [];
            const NativeWebSocket = window.WebSocket;
            window.WebSocket = class extends NativeWebSocket {
              constructor(url: string | URL, protocols?: string | string[]) {
                super(url, protocols);
                this.addEventListener('close', (event) => state.authTestCloseCodes.push(event.code));
              }
            };
          });
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('request', (request) => {
            const url = new URL(request.url());
            if (url.pathname === '/api/v1/serverstate' && url.searchParams.get('longpoll') === 'true')
              longpollRequests++;
          });
          page.on('response', (response) => {
            const url = new URL(response.url());
            if (url.pathname === '/api/v1/auth/refresh') refreshes.push(response.status());
            if (url.pathname === '/api/v1/serverstate')
              polls.push({ status: response.status(), longpoll: url.searchParams.get('longpoll') === 'true' });
          });
          page.on('websocket', (socket) => {
            if (!new URL(socket.url()).pathname.endsWith('/notifications')) return;
            const id = ++socketCount;
            socket.on('framesent', ({ payload }) => {
              const frame = JSON.parse(String(payload));
              if (frame.Action === 'sub') frames.push({ socket: id, service: frame.Service });
            });
            socket.on('framereceived', ({ payload }) => {
              const frame = JSON.parse(String(payload));
              frames.push({ socket: id, type: frame.Type, success: frame.Success });
            });
          });
          // Only the single 503 is synthetic. Login, JWT validation, successful
          // refreshes, WebSocket messages and polls all reach the real server.
          await page.route('**/api/v1/auth/refresh', async (route) => {
            if (transient && !injected) {
              injected = true;
              await route.fulfill({
                status: 503,
                json: { Error: 'Temporary refresh outage injected by the live E2E' },
              });
            } else await route.continue();
          });
          await page.goto('/login');
          await page.getByPlaceholder('Enter your password').fill(password);
          const loggedIn = page.waitForResponse(
            (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/auth/login'
          );
          await page.getByRole('button', { name: 'Login', exact: true }).click();
          const { AccessToken: token } = await (await loggedIn).json();
          const jwt = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
          expect(jwt.exp - jwt.nbf).toBe(60);
          await expect(page).toHaveURL('/');
          const origin = await page.evaluate(() => performance.timeOrigin);
          const status = page.locator('app-status-bar');
          const pause = status.getByRole('button', { name: 'Pause', exact: true });
          const resume = status.getByRole('button', { name: 'Resume', exact: true });
          await expect(pause).toBeVisible();
          const required = ['legacystatus', 'backuplist', 'notifications'];
          if (mode === 'websocket') {
            await expect
              .poll(() => required.every((type) => frames.some((x) => x.type === type)), { timeout: 20_000 })
              .toBe(true);
          } else {
            await expect
              .poll(() => polls.some((x) => x.status === 200) && longpollRequests > 0, { timeout: 20_000 })
              .toBe(true);
          }
          // Use real time on both client and server. The server, not an altered
          // browser clock or a forged token, must reject the original JWT.
          await expect
            .poll(
              async () =>
                (
                  await api.get('/api/v1/systeminfo', {
                    headers: { Authorization: `Bearer ${token}` },
                  })
                ).status(),
              { timeout: 85_000, intervals: [1000] }
            )
            .toBe(401);
          const expiredAt = Date.now();
          if (mode === 'websocket') liveServer.disconnectWebSockets();
          else await state('pause'); // Wake the authenticated in-flight poll so its successor validates the expired token.
          await expect.poll(() => refreshes, { timeout: 45_000 }).toEqual(transient ? [503, 200] : [200]);
          if (mode === 'websocket') {
            await expect
              .poll(
                async () => {
                  const codes = await page.evaluate(
                    () => (window as unknown as Window & { authTestCloseCodes: number[] }).authTestCloseCodes
                  );
                  return codes.includes(4401) || frames.some((x) => x.type === undefined && x.success === false);
                },
                { timeout: 20_000 }
              )
              .toBe(true);
            await expect
              .poll(() => required.every((type) => frames.some((x) => x.socket === socketCount && x.type === type)), {
                timeout: 20_000,
              })
              .toBe(true);
            expect(socketCount).toBeGreaterThan(1);
            await state('pause');
          } else {
            expect(socketCount).toBe(0);
            expect(polls.some((x) => x.status === 401)).toBe(true);
          }
          await expect(resume).toBeVisible({ timeout: 20_000 });
          const pollsBeforeResume = polls.length;
          await state('resume');
          await expect(pause).toBeVisible({ timeout: 20_000 });
          if (mode === 'longpoll')
            await expect
              .poll(() => polls.slice(pollsBeforeResume).some((x) => x.status === 200), { timeout: 20_000 })
              .toBe(true);
          await expect(page.getByRole('heading', { name: 'Reconnecting...', exact: true })).toHaveCount(0);
          expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
          expect(errors).toEqual([]);
          expect(injected).toBe(transient);
          const evidence = testInfo.outputPath('auth-reconnect-results.json');
          await writeFile(
            evidence,
            JSON.stringify(
              {
                mode,
                transient,
                tokenLifetimeSeconds: jwt.exp - jwt.nbf,
                expiredTokenStatus: 401,
                closeCodes: await page.evaluate(
                  () => (window as unknown as Window & { authTestCloseCodes: number[] }).authTestCloseCodes
                ),
                longpollRequests,
                expiredAt,
                refreshes,
                polls,
                frames,
                socketCount,
                reloads: 0,
                server: { version: info.ServerVersionName, runtime: info.CLRVersion },
                errors,
              },
              null,
              2
            )
          );
          await testInfo.attach('auth-reconnect-results', { path: evidence, contentType: 'application/json' });
        }
      );
    }
  });
}
