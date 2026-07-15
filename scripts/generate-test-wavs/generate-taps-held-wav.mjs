// Generates e2e/fixtures/taps-held.wav: like generate-taps-wav.mjs, but
// precisely timed for REAL-TIME play (no "Wait for correct note") so
// audio-taps-held.spec.ts can also exercise *held*-note credit — the engine
// crediting a note for as long as the mic keeps sustaining it, not just for
// being struck. Run with:
//   node --experimental-strip-types scripts/generate-test-wavs/generate-taps-held-wav.mjs
//
// This script lives outside e2e/fixtures/ (only the generated .wav files do)
// so Playwright's test discovery never has to look past actual fixtures.
//
// Layout: `LEADING_SILENCE_MS` of silence, then each note's tone starting
// exactly on its beat and held for most of that beat's one-beat hold window
// (BEAT_MS - GAP_MS), leaving a short silent gap for the mic's release
// debounce before the next onset. The test triggers this file's playback at
// the exact instant the countdown ends (not by waiting a guessed amount of
// time), so `LEADING_SILENCE_MS` only needs to cover the lead-in every song
// applies after that (LEAD_IN in src/scoring/timing.ts) — see
// audio-taps-held.spec.ts for how that trigger works.

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  SAMPLE_RATE,
  loadBuiltinSong,
  noteFrequencies,
  toneSamples,
  silenceSamples,
  writeWav,
} from './wav.mjs'

const song = loadBuiltinSong('taps')
const notesHz = noteFrequencies(song)

// The test triggers this file's playback at the exact instant the countdown
// ends, so this only needs to cover the lead-in every song applies after that
// (LEAD_IN in src/scoring/timing.ts).
export const LEADING_SILENCE_MS = 2400
const BEAT_MS = 60000 / song.bpm // 909.09ms — equals Taps' one-beat hold window exactly
// Taps repeats the same note back to back twice ("D, D" at the start) and
// three times ("D, D, D" near the end). Distinguishing two such notes relies
// entirely on the mic hearing true silence between them (nothing else
// changes), so the gap needs real margin: 110ms mostly worked but occasionally
// left a repeated note's onset undetected (the release debounce needs 2
// *consecutive* silent frames, and a single stray frame near the tail resets
// it) — 250ms matches the gap already proven reliable in generate-taps-wav.mjs.
const GAP_MS = 250
const TONE_MS = BEAT_MS - GAP_MS // ~659ms held, ~72% of the note's hold window
const AMPLITUDE = 0.3

const chunks = [silenceSamples(LEADING_SILENCE_MS)]
for (const freq of notesHz) {
  chunks.push(toneSamples(freq, TONE_MS, AMPLITUDE))
  chunks.push(silenceSamples(GAP_MS))
}
const total = chunks.reduce((n, c) => n + c.length, 0)

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'e2e',
  'fixtures',
  'taps-held.wav',
)
const bytes = writeWav(outPath, chunks)
console.log(
  `Wrote ${outPath} (${(bytes / 1024).toFixed(1)} KiB, ${(total / SAMPLE_RATE).toFixed(2)}s)`,
)
