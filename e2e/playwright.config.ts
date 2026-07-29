import { defineConfig } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function getBaseUrl(): string {
  return process.env.BASE_URL || 'http://localhost:5173';
}

function getBackendUrl(): string {
  return process.env.BACKEND_URL || 'http://localhost:5000';
}

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 1,
  workers: 1, // Serial execution due to shared DB state
  fullyParallel: false,

  use: {
    baseURL: getBaseUrl(),
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  // Optionally start backend + frontend
  // webServer: [
  //   {
  //     command: 'cd ../backend && cargo run',
  //     port: 5000,
  //     reuseExistingServer: true,
  //     timeout: 120_000,
  //   },
  //   {
  //     command: 'cd ../tsv-tennis-app && npm run dev',
  //     port: 5173,
  //     reuseExistingServer: true,
  //     timeout: 30_000,
  //   },
  // ],

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  outputDir: './test-results',
});
