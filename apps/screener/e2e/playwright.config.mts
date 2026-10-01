import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// Point BASE_URL at a deployed site (e.g. the post-deploy smoke check) to skip the local server.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // CI tests the production build (what users get); locally the dev server is faster to iterate on.
  webServer: process.env['BASE_URL']
    ? undefined
    : {
        command: process.env['CI']
          ? 'npx nx run screener:serve-static'
          : 'npx nx run screener:serve',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env['CI'],
        cwd: workspaceRoot,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
