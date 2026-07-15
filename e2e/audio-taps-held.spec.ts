import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  setWaitForNote,
  enableMic,
  selectAndPlaySong,
  mockMicFromWav,
  waitForCountdownEndAndStartFakeMic,
} from './helpers'

const TAPS_HELD_WAV = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/taps-held.wav',
)

// Companion to audio-taps.spec.ts: that test turns on "Wait for correct note"
// so it never has to deal with real-time timing, but that also means it can
// only ever prove a note was *struck* — the song immediately holds the clock
// the instant a note is caught, so heldMs barely accrues. This test plays
// Taps in real time instead (no wait-for-note) specifically to exercise the
// engine crediting a *held* mic note (see holdFraction()/holdPoints() in
// data/scoring.ts) as it actually sustains, the same way a keyboard hold does.
//
// That means this recording's timing has to actually line up with the game's
// clock, unlike taps.wav's looping onset-only recording. Rather than guess a
// delay, `mockMicFromWav` replaces getUserMedia with a fake mic the test
// starts explicitly, right as the countdown ends
// (`waitForCountdownEndAndStartFakeMic`) — taps-held.wav's leading silence
// (LEADING_SILENCE_MS in generate-taps-held-wav.mjs) is exactly the lead-in
// every song applies after that, so its 15 held tones land on Taps' 15
// notes' beats. Each tone holds most of its one-beat window
// (generate-taps-held-wav.mjs), so a healthy score below — not just zero
// misses — is what actually shows the engine credited the *hold*, not merely
// the onset.
//
// Unlike every other e2e test here, this one's correctness genuinely depends
// on real-time scheduling (there's no "Wait for correct note" safety net to
// fall back on — see above), so it needs the CPU headroom `workers` is
// capped for in playwright.config.ts: under heavy contention, the single
// frame the recording starts on can land a note just outside its window.
test('the mic credits a held note in real time, not just its onset', async ({ page }) => {
  test.setTimeout(60_000)
  await mockMicFromWav(page, TAPS_HELD_WAV)
  await page.goto('/')
  await setWaitForNote(page, false)
  await enableMic(page)
  await selectAndPlaySong(page, 'Taps')
  await waitForCountdownEndAndStartFakeMic(page)

  await expect(page.getByRole('heading', { name: 'Song Complete!' })).toBeVisible({
    timeout: 40_000,
  })

  await expect(page.locator('.judge--miss strong')).toHaveText('0')
  // Not "no misses" alone: an unheld instant tap would also score 0 hold
  // credit on every note (holdPoints() rounds rating-points * heldFraction,
  // and a bare onset holds ~0% of the beat) so the total would stay near 0
  // regardless of grade. A comfortably-above-zero score is what actually
  // shows sustained credit was accruing, not just onset detection - kept low
  // enough to tolerate normal run-to-run variance in exactly how much of each
  // beat's hold window the onset landed inside of.
  const score = Number(await page.locator('.stat--score .stat__value').textContent())
  expect(score).toBeGreaterThan(150)
})
