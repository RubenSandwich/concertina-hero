// Generates e2e/fixtures/chord-parade.wav: a synthetic "performance" of the
// built-in "Chord Parade" song (src/data/builtinSongs/chord-parade.json),
// used as a fake microphone input for e2e/audio-chords.spec.ts.
//
// Each chart beat becomes a tone at that button/direction's exact frequency
// (derived from the actual chart + the default 7-button tuning — see
// wav.mjs's `loadBuiltinSong`/`chordFrequencies`); a chord beat like
// "(+1 +3)" becomes several simultaneous tones summed together instead of
// one, so the mic pipeline actually has to resolve more than one note at
// once. Every beat is separated by silence so the app's onset detection
// (which delineates a "press" by a note starting after a silent gap, not by
// pitch changing) sees the same distinct beats, in the same order, as the
// chart. Run with:
//   node --experimental-strip-types e2e/fixtures/generate-chord-parade-wav.mjs
//
// Committing the generated .wav alongside this script means the test doesn't
// need to regenerate it, but re-run this file if Chord Parade's chart or
// tuning ever changes.
//
// This file loops continuously and is only ever paired with "Wait for
// correct note" (see audio-chords.spec.ts), so its exact timing relative to
// the game clock doesn't matter — see generate-taps-held-wav.mjs for a
// fixture that instead needs to line up with the game clock exactly.

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  SAMPLE_RATE,
  loadBuiltinSong,
  chordFrequencies,
  chordSamples,
  silenceSamples,
  writeWav,
} from './wav.mjs'

const TONE_MS = 700
const GAP_MS = 250
const FADE_MS = 15 // avoids a click at each tone's start/end
const AMPLITUDE = 0.3 // of full scale, per tone — comfortably above the detector's RMS floor

const chords = chordFrequencies(loadBuiltinSong('chord-parade'))

const chunks = []
for (const freqs of chords) {
  chunks.push(chordSamples(freqs, TONE_MS, FADE_MS, AMPLITUDE))
  chunks.push(silenceSamples(GAP_MS))
}
const total = chunks.reduce((n, c) => n + c.length, 0)

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'chord-parade.wav',
)
const bytes = writeWav(outPath, chunks)
console.log(
  `Wrote ${outPath} (${(bytes / 1024).toFixed(1)} KiB, ${(total / SAMPLE_RATE).toFixed(2)}s)`,
)
