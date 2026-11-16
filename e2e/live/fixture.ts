import { test as base, request, type APIRequestContext } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import net, { type Socket } from 'node:net';
import { dirname, extname, join, resolve, sep } from 'node:path';

type LiveServer = { url: string; password: string; directory: string; api: APIRequestContext };

export const test = base.extend<{}, { liveServer: LiveServer }>({
  liveServer: [
    async ({}, use, workerInfo) => {
      const executable = process.env['DUPLICATI_SERVER_PATH'];
      if (!executable || !(await stat(executable)).isFile()) {
        throw new Error('Set DUPLICATI_SERVER_PATH to a local Duplicati.Server executable (not a running server URL).');
      }
      const binary = resolve(executable);
      const build = resolve('dist/ngclient/browser');
      await stat(join(build, 'index.html'));
      await mkdir(workerInfo.project.outputDir, { recursive: true });
      const directory = await mkdtemp(join(workerInfo.project.outputDir, 'live-server-'));
      const password = randomUUID();
      const reservation = net.createServer();
      reservation.listen(0, '127.0.0.1');
      await once(reservation, 'listening');
      const apiPort = (reservation.address() as net.AddressInfo).port;
      await new Promise<void>((resolve, reject) => reservation.close((error) => (error ? reject(error) : resolve())));
      const log = createWriteStream(join(directory, 'server.log'));
      const child = spawn(
        binary,
        [
          `--server-datafolder=${join(directory, 'data')}`,
          '--allow-insecure-datafolder=true',
          '--disable-db-encryption=true',
          `--webservice-port=${apiPort}`,
          '--webservice-interface=loopback',
          `--webservice-password=${password}`,
        ],
        { cwd: dirname(binary), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      child.stdout?.pipe(log, { end: false });
      child.stderr?.pipe(log, { end: false });
      let startupError: Error | undefined;
      child.on('error', (error) => {
        startupError = error;
      });
      const sockets = new Set<Socket>();
      const track = (socket: Socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
        return socket;
      };
      const apiURL = `http://127.0.0.1:${apiPort}`;
      let api: APIRequestContext | undefined;
      const probe = await request.newContext({ baseURL: apiURL });
      const proxy = http.createServer(async (req, res) => {
        const pathname = new URL(req.url!, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) {
          const upstream = http.request(
            {
              hostname: '127.0.0.1',
              port: apiPort,
              path: req.url,
              method: req.method,
              headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
            },
            (reply) => {
              res.writeHead(reply.statusCode!, reply.headers);
              reply.pipe(res);
            }
          );
          upstream.on('error', () => {
            if (!res.headersSent) res.writeHead(502);
            res.end();
          });
          res.on('close', () => {
            if (!res.writableEnded) upstream.destroy();
          });
          req.pipe(upstream);
          return;
        }
        try {
          let file = resolve(build, '.' + decodeURIComponent(pathname));
          if (file !== build && !file.startsWith(build + sep)) {
            res.writeHead(404).end();
            return;
          }
          if (!extname(file)) file = join(build, 'index.html');
          const types: Record<string, string> = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.woff2': 'font/woff2',
          };
          res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          res.end(await readFile(file));
        } catch {
          res.writeHead(404).end();
        }
      });
      proxy.on('connection', track);
      proxy.on('upgrade', (req, socket, head) => {
        if (!new URL(req.url!, 'http://localhost').pathname.endsWith('/notifications')) {
          socket.destroy();
          return;
        }
        const upstream = track(
          net.connect(apiPort, '127.0.0.1', () => {
            upstream.write(
              `${req.method} ${req.url} HTTP/1.1\r\n` +
                Object.entries({ ...req.headers, host: `127.0.0.1:${apiPort}` })
                  .map(([key, value]) => `${key}: ${value}`)
                  .join('\r\n') +
                '\r\n\r\n'
            );
            upstream.write(head);
            socket.pipe(upstream);
            upstream.pipe(socket);
          })
        );
        upstream.on('error', () => socket.destroy());
        socket.on('error', () => upstream.destroy());
        socket.on('close', () => upstream.destroy());
      });
      try {
        const deadline = Date.now() + 60_000;
        let ready = false;
        while (Date.now() < deadline) {
          if (startupError || child.exitCode !== null)
            throw startupError ?? new Error(`Duplicati exited: ${child.exitCode}. See ${directory}/server.log`);
          const response = await probe.get('/api/v1/systeminfo', { timeout: 1000 }).catch(() => null);
          if (response && [200, 401].includes(response.status())) {
            ready = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!ready) throw new Error(`Duplicati did not start. See ${directory}/server.log`);
        const login = await probe.post('/api/v1/auth/login', { data: { Password: password, RememberMe: false } });
        if (!login.ok()) throw new Error(`Isolated server login failed: ${login.status()}`);
        const { AccessToken } = await login.json();
        api = await request.newContext({
          baseURL: apiURL,
          extraHTTPHeaders: { Authorization: `Bearer ${AccessToken}`, 'X-Ui-Language': 'en-US' },
        });
        const settings = await api.patch('/api/v1/serversettings', {
          data: { 'shown-welcome-page-v1': 'true', 'has-asked-for-password-change': 'true' },
        });
        if (!settings.ok()) throw new Error(`Fixture settings failed: ${settings.status()}`);
        proxy.listen(0, '127.0.0.1');
        await once(proxy, 'listening');
        await use({ url: `http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}`, password, directory, api });
      } finally {
        await api?.dispose();
        await probe.dispose();
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise<void>((resolve) => proxy.close(() => resolve()));
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          const closed = once(child, 'close');
          child.kill();
          await closed;
        }
        const finished = once(log, 'finish');
        log.end();
        await finished;
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ liveServer }, use) => {
    await use(liveServer.url);
  },
});
export { expect } from '@playwright/test';
