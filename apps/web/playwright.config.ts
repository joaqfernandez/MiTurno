import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3101', timezoneId: 'America/Argentina/Mendoza', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'apps/api-python/.venv/bin/python scripts/e2e_backend.py',
      cwd: path.resolve(__dirname, '../..'),
      url: 'http://127.0.0.1:3100/api/health',
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'npx next dev -p 3101 -H 127.0.0.1',
      env: { API_URL: 'http://127.0.0.1:3100', NEXT_DIST_DIR: '.next-e2e', NEXT_PUBLIC_API_URL: '' },
      url: 'http://127.0.0.1:3101',
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
  ],
});
