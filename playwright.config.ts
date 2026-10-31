import { defineConfig } from '@playwright/test';

const mode = process.env['PLAYWRIGHT_MODE'] ?? 'e2e';
if (mode !== 'e2e' && mode !== 'startup') throw new Error('PLAYWRIGHT_MODE must be e2e or startup');
const startup = mode === 'startup';
const baseURL = `http://127.0.0.1:${startup ? 3001 : 3000}`;

export default defineConfig({
  testDir: startup ? './benchmarks' : './e2e',
  ...(startup ? { testMatch: 'startup-loading.benchmark.ts', timeout: 120_000 } : {}),
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: startup ? [['list']] : [['list'], ['html', { open: 'never' }]],
  outputDir: startup ? (process.env['STARTUP_RESULTS_DIR'] ?? 'tmp/startup-results') : 'test-results',
  use: {
    baseURL,
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
    trace: startup ? 'off' : 'retain-on-failure',
    screenshot: startup ? 'off' : 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: startup ? 'bun benchmarks/server.ts' : 'bun run preview',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    env: { HOST: '127.0.0.1', PORT: startup ? '3001' : '3000' },
  },
});
