import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// Point BASE_URL at a deployed site (e.g. the post-deploy smoke check) to skip the local server.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

/**
 * Browser matrix (see ADR 0015): Chromium runs every journey on every change; a mobile profile
 * runs the journeys tagged @mobile; Firefox and WebKit run everything when E2E_ALL_BROWSERS=1
 * (pushes to main), keeping pull request feedback fast.
 */
const allBrowsers = !!process.env['E2E_ALL_BROWSERS'];

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  use: {
    baseURL,
    locale: 'en-US',
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
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      grep: /@mobile/,
    },
    ...(allBrowsers
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            grepInvert: /@mobile/,
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            grepInvert: /@mobile/,
          },
        ]
      : []),
  ],
});
