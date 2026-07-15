import { defineConfig, devices } from '@playwright/test'

// End-to-end tests drive a real browser against the app's own dev server —
// unlike the `npm test` unit tests (pure logic, no DOM), these exist to catch
// exactly the class of bug that only shows up in a real browser: rAF timing,
// keyboard events, audio unlock gestures. See docs/conventions.md's
// "TypeScript & tooling" section.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // One of the mic tests (audioTapsHeld.spec.ts) verifies real-time note
  // timing with no "wait for the right note" safety net, so it's sensitive to
  // scheduling delays under CPU contention — capping workers well below this
  // machine's core count keeps enough headroom that the moment it triggers
  // fake-mic playback doesn't get delayed by other tests' Chromium instances
  // competing for the CPU at the same time.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PW_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    // Mic tests (audioTaps.spec.ts, audioTapsHeld.spec.ts) mock
    // getUserMedia itself in-page (see e2e/helpers/index.ts's `mockMicFromWav`), so
    // they never touch a real or fake OS-level capture device — no
    // permission grant or fake-device flags needed. `--mute-audio` is still
    // real, though: it guarantees nothing is ever audible on the test
    // machine's speakers, since the app's synth (audio/sound.ts) plays real
    // tones on hits regardless of where the mic input came from.
    launchOptions: {
      args: ['--mute-audio'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
})
