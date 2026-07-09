// Tests for the mic pitch-detection pipeline. Run with: npm test
//
// These exercise the real DSP (autocorrelation + note mapping) on synthesised
// audio buffers — the same code `detectNote()` runs on live mic data, minus the
// getUserMedia capture (which needs a real device/browser).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  autoCorrelate,
  closestNote,
  analyzeBuffer,
  analyzeChord,
  spectrum,
  TOLERANCE_CENTS,
  MIC_FFT_SIZE,
} from './pitch.ts'
import { LANE_NOTES } from '../data/instrument.ts'

const SR = 44100
const SIZE = 2048

const DIRECTIONS = ['push', 'pull'] as const

// Sum several sawtooths into one buffer, as a chord of concertina reeds would.
// Normalised so the mix never clips, which also stops note count from inflating
// the RMS gate.
function makeChordBuffer(
  freqs: number[],
  {
    sampleRate = SR,
    size = MIC_FFT_SIZE,
    startAt = 0,
  }: {
    sampleRate?: number
    size?: number
    startAt?: number
  } = {},
): Float32Array {
  const b = new Float32Array(size)
  for (let i = startAt; i < size; i++) {
    const t = i / sampleRate
    let v = 0
    for (const f of freqs) v += 2 * ((f * t) % 1) - 1
    b[i] = v / freqs.length
  }
  return b
}

// The lanes/direction a chord token like "(+1 +3)" means, as lane indices.
const lanesOf = (notes: { lane: number }[]) => notes.map((n) => n.lane)
const freqsOf = (lanes: number[], type: 'push' | 'pull') =>
  lanes.map((l) => LANE_NOTES[l][type].freq)

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

// ---------- Chord (multi-pitch) detection ----------

test('spectrum peaks in the bin holding the tone', () => {
  const { mag, binHz } = spectrum(makeBuffer(440, { type: 'sine', size: MIC_FFT_SIZE }), SR)
  let peak = 0
  let peakBin = -1
  for (let k = 0; k < mag.length; k++) {
    if (mag[k] > peak) {
      peak = mag[k]
      peakBin = k
    }
  }
  assert.ok(Math.abs(peakBin * binHz - 440) <= binHz, `peak at ${(peakBin * binHz).toFixed(1)} Hz`)
})

test('spectrum of silence is flat zero', () => {
  const { mag } = spectrum(new Float32Array(MIC_FFT_SIZE), SR)
  assert.ok(mag.every((m) => m === 0))
})

test('analyzeChord finds each single button note, with its direction', () => {
  for (let lane = 0; lane < LANE_NOTES.length; lane++) {
    for (const type of DIRECTIONS) {
      const { freq, name } = LANE_NOTES[lane][type]
      const found = analyzeChord(makeChordBuffer([freq]), SR)
      assert.equal(found.length, 1, `button ${lane + 1} ${type} (${name}) -> ${found.length} notes`)
      assert.equal(found[0].lane, lane)
      assert.equal(found[0].type, type)
      assert.equal(found[0].name, name)
    }
  }
})

test('analyzeChord resolves the chords Chord Parade actually uses', () => {
  const chords: [number[], 'push' | 'pull'][] = [
    [[0, 2], 'push'], // (+1 +3)
    [[1, 2], 'pull'], // (-2 -3)
    [[2, 4], 'push'], // (+3 +5)
    [[2, 3], 'pull'], // (-4 -3)
    [[0, 2, 4], 'push'], // (+1 +3 +5)
  ]
  for (const [lanes, type] of chords) {
    const found = analyzeChord(makeChordBuffer(freqsOf(lanes, type)), SR)
    assert.deepEqual(lanesOf(found), lanes, `${type} chord on buttons ${lanes.map((l) => l + 1)}`)
    assert.ok(
      found.every((n) => n.type === type),
      'every note of a chord shares one bellows direction',
    )
  }
})

test('a lone high note does not hallucinate the note an octave below it', () => {
  // Button 6 push (G, 783.99) is exactly twice button 3 push (G, 392). Since notes
  // are taken lowest-first, a loose gate would let the silent sub-harmonic be
  // claimed before the note that is actually sounding.
  const found = analyzeChord(makeChordBuffer([LANE_NOTES[5].push.freq]), SR)
  assert.deepEqual(lanesOf(found), [5])
})

test('a harmonic-rich single note does not hallucinate its own octave', () => {
  // Button 1 push (C, 261.63) has a strong 2nd harmonic sitting exactly on
  // button 4 push (C, 523.25). Cancellation must claim it for the fundamental.
  const found = analyzeChord(makeChordBuffer([LANE_NOTES[0].push.freq]), SR)
  assert.deepEqual(lanesOf(found), [0])
})

test('an octave chord is heard as its lower note (the octave ambiguity)', () => {
  // C + C' cannot be told apart from C with a loud 2nd harmonic: the upper note
  // has no evidence of its own. Measured through a real mic, trying to separate
  // them by subtracting a modelled overtone invented a phantom under every note,
  // so the octave above is ruled out instead. No chart uses an octave chord.
  const found = analyzeChord(
    makeChordBuffer([LANE_NOTES[0].push.freq, LANE_NOTES[3].push.freq]),
    SR,
  )
  assert.deepEqual(lanesOf(found), [0])
})

// Buttons whose frequency is an integer harmonic of a lower button's, same
// direction. These are the pairs a mic can never separate — button 6 push really
// is the 3rd harmonic of button 1 push, not only the octaves.
function harmonicPairs(type: 'push' | 'pull'): string[] {
  const pairs: string[] = []
  for (let low = 0; low < LANE_NOTES.length; low++) {
    for (let high = low + 1; high < LANE_NOTES.length; high++) {
      const ratio = LANE_NOTES[high][type].freq / LANE_NOTES[low][type].freq
      const h = Math.round(ratio)
      if (h >= 2 && h <= 5 && Math.abs(ratio - h) < 0.01)
        pairs.push(`${low + 1}->${high + 1}:h${h}`)
    }
  }
  return pairs
}

test('the buttons that collide as harmonics are exactly the known ones', () => {
  assert.deepEqual(harmonicPairs('push'), ['1->4:h2', '1->6:h3', '2->5:h2', '2->7:h3', '3->6:h2'])
  assert.deepEqual(harmonicPairs('pull'), ['1->5:h2', '1->7:h3', '2->6:h2', '3->7:h2'])
})

test('no chord the game ships contains a harmonic of one of its own notes', () => {
  // This is what makes ruling overtones out safe: a real chord never loses a note
  // to the rule, because none of its notes is an overtone of another.
  const chords: [number[], 'push' | 'pull'][] = [
    [[0, 2], 'push'],
    [[1, 2], 'pull'],
    [[2, 4], 'push'],
    [[2, 3], 'pull'],
    [[0, 2, 4], 'push'],
  ]
  for (const [lanes, type] of chords) {
    for (const low of lanes) {
      for (const high of lanes) {
        if (high <= low) continue
        const ratio = LANE_NOTES[high][type].freq / LANE_NOTES[low][type].freq
        const h = Math.round(ratio)
        assert.ok(
          h < 2 || Math.abs(ratio - h) > 0.01,
          `button ${high + 1} is harmonic ${h} of button ${low + 1} in a ${type} chord`,
        )
      }
    }
  }
})

test('analyzeChord never mixes push and pull notes', () => {
  const found = analyzeChord(
    makeChordBuffer([LANE_NOTES[0].push.freq, LANE_NOTES[2].pull.freq]),
    SR,
  )
  const types = new Set(found.map((n) => n.type))
  assert.ok(types.size <= 1, `got ${[...types].join(' + ')}`)
})

test('analyzeChord honours the maxNotes cap', () => {
  const freqs = freqsOf([0, 2, 4], 'push')
  assert.equal(analyzeChord(makeChordBuffer(freqs), SR, { maxNotes: 2 }).length, 2)
  assert.equal(analyzeChord(makeChordBuffer(freqs), SR, { maxNotes: 1 }).length, 1)
})

test('analyzeChord returns nothing for silence', () => {
  assert.deepEqual(analyzeChord(new Float32Array(MIC_FFT_SIZE), SR), [])
})

test('a chord struck partway through the window is still heard', () => {
  // The mic buffer is ~93ms, so an onset lands mid-window. Detection must not
  // wait for the note to fill the whole buffer.
  const freqs = freqsOf([0, 2], 'push')
  const half = makeChordBuffer(freqs, { startAt: MIC_FFT_SIZE / 2 })
  assert.deepEqual(lanesOf(analyzeChord(half, SR)), [0, 2])
})
