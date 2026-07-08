// Tests for the mic pitch-detection pipeline. Run with: npm test
//
// These exercise the real DSP (autocorrelation + note mapping) on synthesised
// audio buffers — the same code `detectNote()` runs on live mic data, minus the
// getUserMedia capture (which needs a real device/browser).

import test from 'node:test'
import assert from 'node:assert/strict'
import { autoCorrelate, closestNote, analyzeBuffer, TOLERANCE_CENTS } from './pitch.ts'
import { LANE_NOTES } from '../data/instrument.ts'

const SR = 44100
const SIZE = 2048

const DIRECTIONS = ['push', 'pull'] as const

// Synthesise a time-domain buffer for a tone. A naive sawtooth is harmonic-rich,
// closer to a real concertina reed and a good stress test for octave errors.
function makeBuffer(
  freq: number,
  {
    type = 'saw',
    sampleRate = SR,
    size = SIZE,
  }: { type?: 'saw' | 'sine'; sampleRate?: number; size?: number } = {},
): Float32Array {
  const b = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const t = i / sampleRate
    if (type === 'sine') {
      b[i] = Math.sin(2 * Math.PI * freq * t)
    } else {
      const phase = (freq * t) % 1
      b[i] = 2 * phase - 1
    }
  }
  return b
}

const centsBetween = (a: number, b: number) => 1200 * Math.log2(a / b)

test('closestNote maps every exact button frequency to itself', () => {
  for (let lane = 0; lane < LANE_NOTES.length; lane++) {
    for (const type of DIRECTIONS) {
      const { freq, name } = LANE_NOTES[lane][type]
      const c = closestNote(freq)!
      assert.equal(c.lane, lane)
      assert.equal(c.type, type)
      assert.equal(c.name, name)
      assert.ok(Math.abs(c.cents) < 1e-6)
    }
  }
})

test('closestNote distinguishes octave pairs (low C vs high C)', () => {
  assert.equal(closestNote(261.63)!.lane, 0) // button 1, middle C
  assert.equal(closestNote(523.25)!.lane, 3) // button 4, high C
  assert.equal(closestNote(261.63)!.name, 'C')
  assert.equal(closestNote(523.25)!.name, 'C')
})

test('closestNote reports a signed cents offset', () => {
  assert.ok(closestNote(398)!.cents > 0) // sharp of G (392)
  assert.ok(closestNote(388)!.cents < 0) // flat of G (392)
})

test('a mistuned note within tolerance still matches', () => {
  const c = closestNote(398)! // ~+26 cents from G
  assert.equal(c.type, 'push')
  assert.equal(c.name, 'G')
  assert.ok(Math.abs(c.cents) <= TOLERANCE_CENTS)
})

test('autoCorrelate recovers the fundamental of sine and sawtooth tones', () => {
  for (const f of [261.63, 349.23, 392, 523.25, 659.25, 880, 987.77]) {
    for (const type of ['sine', 'saw'] as const) {
      const detected = autoCorrelate(makeBuffer(f, { type }), SR)
      assert.ok(detected > 0, `no pitch detected for ${f} Hz ${type}`)
      assert.ok(
        Math.abs(centsBetween(detected, f)) < 20,
        `${type} ${f} Hz detected as ${detected.toFixed(1)} Hz`,
      )
    }
  }
})

test('autoCorrelate returns -1 for silence', () => {
  assert.equal(autoCorrelate(new Float32Array(SIZE), SR), -1)
})

test('analyzeBuffer maps each button note to the right button and direction', () => {
  for (let lane = 0; lane < LANE_NOTES.length; lane++) {
    for (const type of DIRECTIONS) {
      const { freq, name } = LANE_NOTES[lane][type]
      const r = analyzeBuffer(makeBuffer(freq, { type: 'saw' }), SR)
      assert.ok(r && r.matched, `no match for button ${lane + 1} ${type} (${name})`)
      assert.equal(r.lane, lane, `wrong button for ${name} ${type}`)
      assert.equal(r.type, type)
      assert.equal(r.name, name)
    }
  }
})

test('analyzeBuffer returns null for silence', () => {
  assert.equal(analyzeBuffer(new Float32Array(SIZE), SR), null)
})
