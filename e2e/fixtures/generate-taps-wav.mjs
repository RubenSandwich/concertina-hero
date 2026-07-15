// Generates e2e/fixtures/taps.wav: a synthetic "performance" of the built-in
// "Taps" song (see src/data/songLibrary.ts), used as a fake microphone input
// for e2e/audio-taps.spec.ts via Chromium's
// `--use-file-for-fake-audio-capture` flag.
//
// Each chart note becomes a plain sine tone at that button/direction's exact
// frequency (src/data/layout.ts's default 7-button tuning), separated by
// silence so the app's onset detection (which delineates a "press" by a note
// starting after a silent gap, not by pitch changing) sees the same 15
// distinct notes, in the same order, as the chart. Run with:
//   node e2e/fixtures/generate-taps-wav.mjs
//
// Committing the generated .wav alongside this script means the test doesn't
// need to regenerate it, but re-run this file if Taps's chart or tuning ever
// changes.

// Generates e2e/fixtures/taps.wav: a synthetic "performance" of the built-in
// "Taps" song (see src/data/songLibrary.ts), used as a fake microphone input
// for e2e/audio-taps.spec.ts via Chromium's
// `--use-file-for-fake-audio-capture` flag.
//
// Each chart note becomes a plain sine tone at that button/direction's exact
// frequency (src/data/layout.ts's default 7-button tuning), separated by
// silence so the app's onset detection (which delineates a "press" by a note
// starting after a silent gap, not by pitch changing) sees the same 15
// distinct notes, in the same order, as the chart. Run with:
//   node e2e/fixtures/generate-taps-wav.mjs
//
// Committing the generated .wav alongside this script means the test doesn't
// need to regenerate it, but re-run this file if Taps's chart or tuning ever
// changes.
//
// This file loops continuously and is only ever paired with "Wait for
// correct note" (see audio-taps.spec.ts), so its exact timing relative to the
// game clock doesn't matter — for a test that needs real-time-accurate
// timing (to also exercise *held*-note credit), see generate-taps-held-wav.mjs.

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { SAMPLE_RATE, TAPS_NOTES_HZ, toneSamples, silenceSamples, writeWav } from './wav.mjs'

const TONE_MS = 700
const GAP_MS = 250
const FADE_MS = 15 // avoids a click at each tone's start/end
const AMPLITUDE = 0.3 // of full scale — comfortably above the detector's RMS floor

const chunks = []
for (const freq of TAPS_NOTES_HZ) {
  chunks.push(toneSamples(freq, TONE_MS, FADE_MS, AMPLITUDE))
  chunks.push(silenceSamples(GAP_MS))
}
const total = chunks.reduce((n, c) => n + c.length, 0)

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'taps.wav')
const bytes = writeWav(outPath, chunks)
console.log(
  `Wrote ${outPath} (${(bytes / 1024).toFixed(1)} KiB, ${(total / SAMPLE_RATE).toFixed(2)}s)`,
)
