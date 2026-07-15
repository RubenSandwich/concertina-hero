// Shared WAV-writing helpers for the e2e mic fixtures. Plain PCM synthesis, no
// dependencies — a standard 16-bit mono WAV is broadly compatible with both
// Chromium's `--use-file-for-fake-audio-capture` and `AudioContext.decodeAudioData`.
//
// Run any script that imports this with `--experimental-strip-types` (like
// `npm test` does) — `loadBuiltinSong`/`noteFrequencies` import straight from
// the app's own `src/data/songs.ts` and `src/data/layout.ts`, so fixtures stay
// derived from the real chart + tuning instead of a hand-copied note list.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildSong } from '../../src/data/songs.ts'
import { LAYOUTS, DEFAULT_INSTRUMENT } from '../../src/data/layout.ts'

export const SAMPLE_RATE = 44100

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Loads and builds a built-in song from its raw JSON definition
// (src/data/builtinSongs/<id>.json — see src/data/songLibrary.ts).
export function loadBuiltinSong(id) {
  const defPath = path.join(
    dirname,
    '..',
    '..',
    'src',
    'data',
    'builtinSongs',
    `${id}.json`,
  )
  const def = JSON.parse(readFileSync(defPath, 'utf8'))
  return buildSong(def)
}

// The Hz of each of `song`'s notes, in chart order, using the default
// instrument's tuning (layout.ts's 7-button push/pull frequencies).
export function noteFrequencies(song) {
  const buttons = LAYOUTS[DEFAULT_INSTRUMENT].buttons
  return song.notes.map((n) => buttons[n.lane][n.type].freq)
}

// A single sine tone, with a short linear fade in/out so it doesn't click.
export function toneSamples(
  freq,
  ms,
  fadeMs,
  amplitude,
  sampleRate = SAMPLE_RATE,
) {
  const n = Math.round((ms / 1000) * sampleRate)
  const fadeN = Math.round((fadeMs / 1000) * sampleRate)
  const samples = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let env = 1
    if (i < fadeN) env = i / fadeN
    else if (i > n - fadeN) env = (n - i) / fadeN
    samples[i] =
      Math.sin((2 * Math.PI * freq * i) / sampleRate) * amplitude * env
  }
  return samples
}

export function silenceSamples(ms, sampleRate = SAMPLE_RATE) {
  return new Float64Array(Math.round((ms / 1000) * sampleRate))
}

// Writes `chunks` (each a Float64Array of samples in [-1, 1]) to `outPath` as
// a canonical 16-bit PCM mono WAV. Returns the file size in bytes.
export function writeWav(outPath, chunks, sampleRate = SAMPLE_RATE) {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const bitsPerSample = 16
  const numChannels = 1
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
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
  buf.writeUInt32LE(sampleRate, 24)
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
  writeFileSync(outPath, buf)
  return buf.length
}
