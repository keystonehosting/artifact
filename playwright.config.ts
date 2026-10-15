import { defineConfig } from '@playwright/test';

// Route the extension service worker's requests too, so background fetches
// (file downloads) hit local fixtures instead of the network.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
