import { defineConfig, devices } from '@playwright/test'

// End-to-end tests drive a real browser against the app's own dev server —
// unlike the `npm test` unit tests (pure logic, no DOM), these exist to catch
// exactly the class of bug that only shows up in a real browser: rAF timing,
// keyboard events, audio unlock gestures. See e2e/README.md.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PW_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
})
