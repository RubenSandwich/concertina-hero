// Shared WAV-writing helpers for the e2e mic fixtures. Lives in
// scripts/generate-test-wavs/ (not e2e/fixtures/, which holds only the
// generated .wav files themselves) alongside the generate-*-wav.mjs scripts
// that write into e2e/fixtures/. Plain PCM synthesis, no dependencies — a
// standard 16-bit mono WAV is broadly compatible with both Chromium's
// `--use-file-for-fake-audio-capture` and `AudioContext.decodeAudioData`.
//
// Tones are synthesized with a free-reed-like overtone mix and a bellows
// attack/decay envelope (see chordSamples) rather than a bare sine, so the
// fixtures actually sound like a concertina — also a *better* test of the
// mic's chord detector than a pure sine, not just an aesthetic choice (see
// /audio/pitch.test.ts's makeChordBuffer, which uses an even richer sawtooth
// for exactly that reason).
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

// Like noteFrequencies, but notes that share a beat (a chart chord like
// "(+1 +3)" — parseChart gives every button in it the same `time`) come back
// grouped into one sub-array, so each chord can be synthesised as one mix of
// simultaneous tones rather than several separate ones.
export function chordFrequencies(song) {
  const buttons = LAYOUTS[DEFAULT_INSTRUMENT].buttons
  const groups = []
  let lastTime = null
  for (const n of song.notes) {
    const freq = buttons[n.lane][n.type].freq
    if (groups.length && n.time === lastTime)
      groups[groups.length - 1].push(freq)
    else groups.push([freq])
    lastTime = n.time
  }
  return groups
}

// The overtone mix (fundamental, 2nd, 3rd harmonic) that gives a synthesized
// tone the sound of a free-reed concertina instead of a bare sine, scaled to
// sum to 1 so a chord of several of these together still peaks about where a
// chord of plain sine tones did.
const RAW_HARMONICS = [1, 0.5, 0.3]
const HARMONIC_SUM = RAW_HARMONICS.reduce((a, b) => a + b, 0)
const HARMONICS = RAW_HARMONICS.map((w) => w / HARMONIC_SUM)

// A bellows-style attack/decay envelope: a linear ramp in, a sustain, a
// linear ramp out — rather than a symmetric click-guard fade. Only applied
// when the tone is long enough to hold a sustain; a tone shorter than
// ATTACK_MS + DECAY_MS plays at full volume throughout instead.
const ATTACK_MS = 80
const DECAY_MS = 120

// One or more concertina-ish tones summed together — several make a chord,
// and a single one is just a plain note. `amplitude` is per tone, not the
// total.
export function chordSamples(freqs, ms, amplitude, sampleRate = SAMPLE_RATE) {
  const n = Math.round((ms / 1000) * sampleRate)
  const attackN = Math.round((ATTACK_MS / 1000) * sampleRate)
  const decayN = Math.round((DECAY_MS / 1000) * sampleRate)
  const hasEnvelope = n > attackN + decayN
  const samples = new Float64Array(n)
  for (const freq of freqs) {
    for (let i = 0; i < n; i++) {
      let env = 1
      if (hasEnvelope) {
        if (i < attackN) env = i / attackN
        else if (i > n - decayN) env = (n - i) / decayN
      }
      let tone = 0
      for (let h = 0; h < HARMONICS.length; h++) {
        tone +=
          Math.sin((2 * Math.PI * freq * (h + 1) * i) / sampleRate) *
          HARMONICS[h]
      }
      samples[i] += tone * amplitude * env
    }
  }
  return samples
}

// A single concertina-ish tone (see chordSamples).
export function toneSamples(freq, ms, amplitude, sampleRate = SAMPLE_RATE) {
  return chordSamples([freq], ms, amplitude, sampleRate)
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
