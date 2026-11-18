import http from 'node:http';
import { test, expect } from '@playwright/test';
import { listenOnBrowserSafePort } from './fixture';

const close = async (server: http.Server) => {
  server.closeAllConnections();
  if (server.listening) await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
};

test('a forbidden low preferred port cannot produce ERR_UNSAFE_PORT', async ({ page }) => {
  const server = http.createServer((_, res) => res.end('browser-safe proxy'));
  try {
    const port = await listenOnBrowserSafePort(server, 6697);
    await page.goto(`http://127.0.0.1:${port}`);
    await expect(page.locator('body')).toHaveText('browser-safe proxy');
    expect(port).toBeGreaterThanOrEqual(49152);
    expect(port).toBeLessThanOrEqual(65535);
    expect(server.listening).toBe(true);
  } finally {
    await close(server);
  }
});

test('an occupied candidate selects a different port while both listeners stay bound', async ({ page }) => {
  const first = http.createServer((_, res) => res.end('first proxy'));
  const second = http.createServer((_, res) => res.end('second proxy'));
  try {
    const occupied = await listenOnBrowserSafePort(first);
    const selected = await listenOnBrowserSafePort(second, occupied);
    expect(selected).not.toBe(occupied);
    expect(selected).toBeGreaterThanOrEqual(49152);
    expect(selected).toBeLessThanOrEqual(65535);
    await page.goto(`http://127.0.0.1:${occupied}`);
    await expect(page.locator('body')).toHaveText('first proxy');
    await page.goto(`http://127.0.0.1:${selected}`);
    await expect(page.locator('body')).toHaveText('second proxy');
    expect(first.listening && second.listening).toBe(true);
  } finally {
    await close(second);
    await close(first);
  }
});

test('a non-retryable listen failure is propagated without leaking error listeners', async ({ page }) => {
  const server = http.createServer((_, res) => res.end('still listening'));
  try {
    const port = await listenOnBrowserSafePort(server);
    const listeners = server.listenerCount('error');
    await expect(listenOnBrowserSafePort(server, port)).rejects.toMatchObject({ code: 'ERR_SERVER_ALREADY_LISTEN' });
    expect(server.listenerCount('error')).toBe(listeners);
    await page.goto(`http://127.0.0.1:${port}`);
    await expect(page.locator('body')).toHaveText('still listening');
  } finally {
    await close(server);
  }
});

test('a reserved candidate is skipped without leaving listeners behind', async ({ page }) => {
  const server = http.createServer((_, res) => res.end('available candidate'));
  const listen = server.listen;
  let attempts = 0;
  server.listen = function (...args: unknown[]) {
    attempts++;
    if (Number(args[0]) >= 49152 && Number(args[0]) < 49252) {
      queueMicrotask(() => server.emit('error', Object.assign(new Error('Reserved port'), { code: 'EACCES' })));
      return server;
    }
    return Reflect.apply(listen, server, args);
  } as typeof server.listen;
  try {
    const port = await listenOnBrowserSafePort(server, 49152);
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(port).toBeGreaterThanOrEqual(49252);
    expect(port).toBeLessThanOrEqual(65535);
    expect(server.listenerCount('error')).toBe(0);
    await page.goto(`http://127.0.0.1:${port}`);
    await expect(page.locator('body')).toHaveText('available candidate');
  } finally {
    server.listen = listen;
    await close(server);
  }
});

test('exhaustion is bounded and removes every temporary listener', async () => {
  const server = http.createServer();
  const initialListeningListeners = server.listenerCount('listening');
  const listen = server.listen;
  let attempts = 0;
  server.listen = (() => {
    attempts++;
    queueMicrotask(() => server.emit('error', Object.assign(new Error('Port occupied'), { code: 'EADDRINUSE' })));
    return server;
  }) as typeof server.listen;
  try {
    await expect(listenOnBrowserSafePort(server)).rejects.toThrow('after 32 attempts');
    expect(attempts).toBe(32);
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(initialListeningListeners);
    expect(server.listening).toBe(false);
  } finally {
    server.listen = listen;
    await close(server);
  }
});
