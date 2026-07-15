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
  transience,
  tuningIssues,
  aliasesOf,
  TOLERANCE_CENTS,
  TRANSIENT_MAX,
  MIC_FFT_SIZE,
} from './pitch.ts'
import {
  LANE_NOTES,
  setNoteFrequencies,
  getDefaultNotes,
  Direction,
  DIRECTIONS,
} from '../instrument/instrument.ts'

// LANE_NOTES is a live, module-level map, so any test that retunes it must put it
// back — the whole file shares one instrument.
function withTuning(
  rows: { push: { freq: number }; pull: { freq: number } }[],
  run: () => void,
) {
  try {
    setNoteFrequencies(rows)
    run()
  } finally {
    setNoteFrequencies(getDefaultNotes())
  }
}

const SR = 44100
const SIZE = 2048

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
const freqsOf = (lanes: number[], type: Direction) =>
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
  assert.equal(c.type, Direction.Push)
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
      assert.ok(
        r && r.matched,
        `no match for button ${lane + 1} ${type} (${name})`,
      )
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
  const { mag, binHz } = spectrum(
    makeBuffer(440, { type: 'sine', size: MIC_FFT_SIZE }),
    SR,
  )
  let peak = 0
  let peakBin = -1
  for (let k = 0; k < mag.length; k++) {
    if (mag[k] > peak) {
      peak = mag[k]
      peakBin = k
    }
  }
  assert.ok(
    Math.abs(peakBin * binHz - 440) <= binHz,
    `peak at ${(peakBin * binHz).toFixed(1)} Hz`,
  )
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
      assert.equal(
        found.length,
        1,
        `button ${lane + 1} ${type} (${name}) -> ${found.length} notes`,
      )
      assert.equal(found[0].lane, lane)
      assert.equal(found[0].type, type)
      assert.equal(found[0].name, name)
    }
  }
})

test('analyzeChord resolves the chords Chord Parade actually uses', () => {
  const chords: [number[], Direction][] = [
    [[0, 2], Direction.Push], // (+1 +3)
    [[1, 2], Direction.Pull], // (-2 -3)
    [[2, 4], Direction.Push], // (+3 +5)
    [[2, 3], Direction.Pull], // (-4 -3)
    [[0, 2, 4], Direction.Push], // (+1 +3 +5)
  ]
  for (const [lanes, type] of chords) {
    const found = analyzeChord(makeChordBuffer(freqsOf(lanes, type)), SR)
    assert.deepEqual(
      lanesOf(found),
      lanes,
      `${type} chord on buttons ${lanes.map((l) => l + 1)}`,
    )
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
function harmonicPairs(type: Direction): string[] {
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
  assert.deepEqual(harmonicPairs(Direction.Push), [
    '1->4:h2',
    '1->6:h3',
    '2->5:h2',
    '2->7:h3',
    '3->6:h2',
  ])
  assert.deepEqual(harmonicPairs(Direction.Pull), [
    '1->5:h2',
    '1->7:h3',
    '2->6:h2',
    '3->7:h2',
  ])
})

test('no chord the game ships contains a harmonic of one of its own notes', () => {
  // This is what makes ruling overtones out safe: a real chord never loses a note
  // to the rule, because none of its notes is an overtone of another.
  const chords: [number[], Direction][] = [
    [[0, 2], Direction.Push],
    [[1, 2], Direction.Pull],
    [[2, 4], Direction.Push],
    [[2, 3], Direction.Pull],
    [[0, 2, 4], Direction.Push],
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
  const freqs = freqsOf([0, 2, 4], Direction.Push)
  assert.equal(
    analyzeChord(makeChordBuffer(freqs), SR, { maxNotes: 2 }).length,
    2,
  )
  assert.equal(
    analyzeChord(makeChordBuffer(freqs), SR, { maxNotes: 1 }).length,
    1,
  )
})

test('analyzeChord returns nothing for silence', () => {
  assert.deepEqual(analyzeChord(new Float32Array(MIC_FFT_SIZE), SR), [])
})

// ---------- Custom tunings ----------

test('analyzeChord follows a retuned instrument', () => {
  // Everything transposed down two semitones: the chord must still resolve, and
  // at the new frequencies — the candidate table cannot be stale.
  const down2 = getDefaultNotes().map((n) => ({
    push: { freq: n.push.freq * Math.pow(2, -2 / 12) },
    pull: { freq: n.pull.freq * Math.pow(2, -2 / 12) },
  }))
  withTuning(down2, () => {
    const freqs = [0, 2, 4].map((l) => LANE_NOTES[l].push.freq)
    assert.deepEqual(
      lanesOf(analyzeChord(makeChordBuffer(freqs), SR)),
      [0, 2, 4],
    )
    assert.ok(
      Math.abs(LANE_NOTES[0].push.freq - 233.08) < 0.1,
      'tuning really did change',
    )
  })
  assert.ok(
    Math.abs(LANE_NOTES[0].push.freq - 261.63) < 0.01,
    'defaults restored',
  )
})

test('a tuning where lane order is not ascending still resolves', () => {
  // Button 1 tuned ABOVE button 2, and to exactly twice it. Scanning by lane index
  // would test 600Hz first and claim it — button 2's own 2nd harmonic — reporting
  // a note nobody played. Scanning by frequency reaches 300Hz first, then rules
  // 600Hz out as its overtone.
  const swapped = getDefaultNotes().map((n, lane) => ({
    push: { freq: lane === 0 ? 600 : lane === 1 ? 300 : n.push.freq },
    pull: { freq: n.pull.freq },
  }))
  withTuning(swapped, () => {
    assert.deepEqual(
      lanesOf(analyzeChord(makeChordBuffer([300]), SR)),
      [1],
      'only button 2 sounds',
    )
    assert.deepEqual(
      lanesOf(analyzeChord(makeChordBuffer([600]), SR)),
      [0],
      'only button 1 sounds',
    )
  })
})

// ---------- Checking a tuning ----------

const freqRows = (push: number[], pull: number[]) =>
  push.map((f, i) => ({ push: { freq: f }, pull: { freq: pull[i] } }))

// A chromatic run of 7 semitones starting at `base`.
const chromatic = (base: number) =>
  Array.from({ length: 7 }, (_, i) => base * Math.pow(2, i / 12))

test('the default tuning raises no issues', () => {
  assert.deepEqual(tuningIssues(getDefaultNotes()), [])
})

test('a missing frequency is an error, not a warning', () => {
  const rows = getDefaultNotes() as unknown as {
    push: { freq: number | string }
    pull: { freq: number | string }
  }[]
  const broken = rows.map((r, i) =>
    i === 2 ? { push: { freq: '' }, pull: r.pull } : r,
  )
  const errors = tuningIssues(broken).filter((x) => x.level === 'error')
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /Button 3 push needs a frequency/)
})

test('a note outside the microphone band warns but does not block', () => {
  const rows = getDefaultNotes()
  rows[0].push.freq = 60
  const issues = tuningIssues(rows)
  assert.ok(
    issues.some(
      (x) =>
        x.level === 'warning' && /outside the 150–1200Hz range/.test(x.message),
    ),
  )
  assert.equal(issues.filter((x) => x.level === 'error').length, 0)
})

test('repeating a note elsewhere on the instrument is not an issue', () => {
  // A real concertina sounds the same note in several places — the same pitch on
  // two buttons, or a push here and a pull there. That is a layout, not a fault.
  const rows = getDefaultNotes()
  rows[3].pull.freq = rows[0].push.freq // button 4 pull := button 1 push
  rows[1].push.freq = rows[1].pull.freq // button 2 push := button 2 pull
  assert.deepEqual(tuningIssues(rows), [])
})

test('a chromatic row raises no issues at any pitch inside the mic band', () => {
  // 700Hz -> 1048Hz; a row from 880 would run past MIC_MAX_HZ and warn for that
  // reason alone, which is a different complaint.
  for (const base of [261.63, 700]) {
    const rows = freqRows(
      chromatic(base),
      getDefaultNotes().map((n) => n.pull.freq),
    )
    assert.deepEqual(tuningIssues(rows), [], `chromatic from ${base}Hz`)
  }
})

// ---------- Aliases: which button did the mic actually hear? ----------

test('under the default tuning every note is its own only alias', () => {
  for (let lane = 0; lane < LANE_NOTES.length; lane++) {
    for (const type of DIRECTIONS) {
      assert.deepEqual(
        aliasesOf(lane, type),
        [{ lane, type }],
        `button ${lane + 1} ${type}`,
      )
    }
  }
})

test('the same pitch on two buttons makes them aliases of each other', () => {
  const rows = getDefaultNotes()
  rows[3].pull.freq = rows[0].push.freq // button 4 pull sounds button 1 push's note
  withTuning(rows, () => {
    assert.deepEqual(aliasesOf(0, Direction.Push), [
      { lane: 0, type: Direction.Push },
      { lane: 3, type: Direction.Pull },
    ])
    assert.deepEqual(aliasesOf(3, Direction.Pull), [
      { lane: 0, type: Direction.Push },
      { lane: 3, type: Direction.Pull },
    ])
  })
})

test('two buttons a semitone apart down low are aliases; up high they are not', () => {
  const low = getDefaultNotes()
  low[1].push.freq = low[0].push.freq * Math.pow(2, 1 / 12) // 15.6Hz apart
  withTuning(low, () => {
    assert.equal(
      aliasesOf(0, Direction.Push).length,
      2,
      'the mic cannot separate them at middle C',
    )
  })

  // 800Hz clears every default pull note by more than CROSS_DIRECTION_ALIAS_HZ,
  // so the only neighbour in play is the semitone above it: 47.6Hz away.
  const high = getDefaultNotes()
  high[5].push.freq = 800
  high[6].push.freq = 800 * Math.pow(2, 1 / 12)
  withTuning(high, () => {
    assert.deepEqual(
      aliasesOf(5, Direction.Push),
      [{ lane: 5, type: Direction.Push }],
      'a semitone up high is clear',
    )
  })
})

// ---------- Transient rejection ----------

test('transience is ~0 for a steady tone and for silence', () => {
  assert.ok(
    transience(makeChordBuffer([440])) < 0.05,
    'a steady tone is stationary',
  )
  assert.equal(
    transience(new Float32Array(MIC_FFT_SIZE)),
    0,
    'silence has no change in level',
  )
})

test('transience is high when a note starts partway through the window', () => {
  const onset = makeChordBuffer([440], { startAt: MIC_FFT_SIZE / 2 })
  assert.ok(transience(onset) > 0.9, `got ${transience(onset)}`)
})

test('transience is high when a note stops partway through the window', () => {
  // The release half of a boundary: loud first, silent second.
  const full = makeChordBuffer([440])
  const release = Float32Array.from(full)
  release.fill(0, MIC_FFT_SIZE / 2)
  assert.ok(transience(release) > 0.9, `got ${transience(release)}`)
})

test('TRANSIENT_MAX separates steady windows from straddling ones', () => {
  const steady = transience(makeChordBuffer([261.63, 392]))
  const straddling = transience(
    makeChordBuffer([261.63, 392], { startAt: MIC_FFT_SIZE / 2 }),
  )
  assert.ok(steady <= TRANSIENT_MAX, `steady ${steady} should be believed`)
  assert.ok(
    straddling > TRANSIENT_MAX,
    `straddling ${straddling} should be rejected`,
  )
})

test('a chord struck partway through the window is still heard', () => {
  // The mic buffer is ~93ms, so an onset lands mid-window. Detection must not
  // wait for the note to fill the whole buffer.
  const freqs = freqsOf([0, 2], Direction.Push)
  const half = makeChordBuffer(freqs, { startAt: MIC_FFT_SIZE / 2 })
  assert.deepEqual(lanesOf(analyzeChord(half, SR)), [0, 2])
})
