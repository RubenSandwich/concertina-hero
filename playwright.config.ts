import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const TAPS_WAV = path.join(dirname, 'e2e/fixtures/taps.wav')

// End-to-end tests drive a real browser against the app's own dev server —
// unlike the `npm test` unit tests (pure logic, no DOM), these exist to catch
// exactly the class of bug that only shows up in a real browser: rAF timing,
// keyboard events, audio unlock gestures. See docs/conventions.md's
// "TypeScript & tooling" section.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PW_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    // Mic tests (audio-taps.spec.ts) need a microphone permission grant, a
    // fake capture device fed from a WAV fixture instead of a real mic, and
    // `--mute-audio` so nothing is ever actually audible on the test machine's
    // speakers — the app's synth (audio/sound.ts) plays real tones on hits
    // otherwise. Harmless for every other test, which never touches the mic.
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--mute-audio',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${TAPS_WAV}`,
      ],
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
