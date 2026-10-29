import { defineConfig } from '@playwright/test';
import original from './playwright.config';

export default defineConfig({
  ...original,
  testDir: './benchmarks',
  testMatch: 'startup-loading.benchmark.ts',
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: process.env['STARTUP_RESULTS_DIR'] ?? 'tmp/startup-results',
  use: { ...original.use, baseURL: 'http://127.0.0.1:3001', trace: 'off', screenshot: 'off' },
  webServer: {
    command: 'bun benchmarks/server.ts',
    url: 'http://127.0.0.1:3001/login',
    reuseExistingServer: false,
  },
});
