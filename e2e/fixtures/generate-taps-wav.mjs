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

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SAMPLE_RATE = 44100
const TONE_MS = 700
const GAP_MS = 250
const FADE_MS = 15 // avoids a click at each tone's start/end
const AMPLITUDE = 0.3 // of full scale — comfortably above the detector's RMS floor

// Taps' chart is "-1 -1 +3 -1 +3 -4 +3 -4 -5 -4 +3 -1 -1 -1 +3" (bpm 66,
// see songLibrary.ts). Each token maps to a button/direction, and each
// button/direction to its default frequency (layout.ts):
//   button 1 pull = D 293.66, button 3 push = G 392.00,
//   button 4 pull = B 493.88, button 5 pull = D 587.33
const NOTES_HZ = [
  293.66, 293.66, 392.0, 293.66, 392.0, 493.88, 392.0, 493.88, 587.33, 493.88, 392.0, 293.66,
  293.66, 293.66, 392.0,
]

function toneSamples(freq) {
  const n = Math.round((TONE_MS / 1000) * SAMPLE_RATE)
  const fadeN = Math.round((FADE_MS / 1000) * SAMPLE_RATE)
  const samples = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let env = 1
    if (i < fadeN) env = i / fadeN
    else if (i > n - fadeN) env = (n - i) / fadeN
    samples[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * AMPLITUDE * env
  }
  return samples
}

function silenceSamples(ms) {
  return new Float64Array(Math.round((ms / 1000) * SAMPLE_RATE))
}

const chunks = []
for (const freq of NOTES_HZ) {
  chunks.push(toneSamples(freq))
  chunks.push(silenceSamples(GAP_MS))
}
const total = chunks.reduce((n, c) => n + c.length, 0)

const bitsPerSample = 16
const numChannels = 1
const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8)
const blockAlign = numChannels * (bitsPerSample / 8)
const dataSize = total * (bitsPerSample / 8)

const buf = Buffer.alloc(44 + dataSize)
buf.write('RIFF', 0, 'ascii')
buf.writeUInt32LE(36 + dataSize, 4)
buf.write('WAVE', 8, 'ascii')
buf.write('fmt ', 12, 'ascii')
buf.writeUInt32LE(16, 16) // fmt chunk size
buf.writeUInt16LE(1, 20) // PCM
buf.writeUInt16LE(numChannels, 22)
buf.writeUInt32LE(SAMPLE_RATE, 24)
buf.writeUInt32LE(byteRate, 28)
buf.writeUInt16LE(blockAlign, 32)
buf.writeUInt16LE(bitsPerSample, 34)
buf.write('data', 36, 'ascii')
buf.writeUInt32LE(dataSize, 40)

let offset = 44
for (const chunk of chunks) {
  for (const sample of chunk) {
    const clamped = Math.max(-1, Math.min(1, sample))
    buf.writeInt16LE(Math.round(clamped * 32767), offset)
    offset += 2
  }
}

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'taps.wav')
writeFileSync(outPath, buf)
console.log(
  `Wrote ${outPath} (${(buf.length / 1024).toFixed(1)} KiB, ${(total / SAMPLE_RATE).toFixed(2)}s)`,
)
