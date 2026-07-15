// Tests for the stateless engine core: stepEngine(state, input) -> {state, events}.
// Being a plain function of its arguments (no DOM, no audio, no clock of its
// own), every scenario below is just "build a state, feed it made-up input,
// assert on what comes back" — no fake timers, mic hardware, or React needed.
// Run with: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSong } from '../songs/songs.ts'
import type { ChordNote, ChordReading } from '../audio/pitch.ts'
import {
  createInitialState,
  stepEngine,
  type EngineState,
  type InputEvent,
} from './gameEngineCore.ts'

// bpm 120, subdivision 1 -> a 500ms beat, so holdMs (one beat) is 500 too.
const song = (chart: string) =>
  buildSong({
    id: 't',
    name: 't',
    blurb: '',
    bpm: 120,
    color: '#fff',
    difficulty: 'Easy',
    chart: [chart],
  })

function advance(
  state: EngineState,
  dtMs: number,
  opts: {
    events?: InputEvent[]
    micReading?: ChordReading | null
    waitForNote?: boolean
    speed?: number
  } = {},
) {
  return stepEngine(state, {
    dtMs,
    speed: opts.speed ?? 1,
    waitForNote: opts.waitForNote ?? false,
    events: opts.events ?? [],
    micReading: opts.micReading ?? null,
  })
}

const chordNote = (
  lane: number,
  type: 'push' | 'pull',
  name = 'x',
): ChordNote => ({
  lane,
  type,
  name,
  freq: 440,
  salience: 1,
})

test('createInitialState starts before the song, every note active', () => {
  const s = createInitialState(song('+1'))
  assert.equal(s.clock, -3000)
  assert.equal(s.countdownMs, 3000)
  assert.equal(s.finished, false)
  assert.equal(s.score, 0)
  assert.equal(s.notes.length, 1)
  assert.equal(s.notes[0].state, 'active')
})

test('the countdown and the game clock both advance from real dt', () => {
  const { state } = advance(createInitialState(song('+1')), 1000)
  assert.equal(state.clock, -2000)
  assert.equal(state.countdownMs, 2000)
})

test('a perfectly-timed, fully-held press scores full points', () => {
  let state = createInitialState(song('+1 -1')) // lane 0: push@0, pull@500
  state = advance(state, 3000).state // clock 0, right on the first note

  // Press push on lane 0 at gameTime 0 - dead on the beat.
  let events
  ;({ state, events } = advance(state, 0, {
    events: [{ kind: 'press', lane: 0, pull: false, gameTime: 0 }],
  }))
  assert.equal(state.notes[0].state, 'holding')
  assert.equal(state.notes[0].rating, 'perfect')
  assert.equal(state.combo, 1)
  assert.equal(events.length, 0)

  // Hold it for the full beat: the note finalizes at clock 500.
  ;({ state } = advance(state, 500))
  assert.equal(state.notes[0].state, 'hit')
  assert.equal(
    state.score,
    100,
    'a fully-held perfect note is worth its full 100 points',
  )

  // Release, then press pull on lane 0 dead on its beat (500).
  ;({ state } = advance(state, 0, {
    events: [
      { kind: 'release', lane: 0 },
      { kind: 'press', lane: 0, pull: true, gameTime: 500 },
    ],
  }))
  assert.equal(state.notes[1].rating, 'perfect')
  assert.equal(state.combo, 2)

  ;({ state } = advance(state, 500))
  assert.equal(state.notes[1].state, 'hit')
  assert.equal(state.score, 200)
  assert.equal(state.maxCombo, 2)
})

test('the wrong bellows direction flags "Wrong Way!" and leaves the note up', () => {
  let state = createInitialState(song('+1'))
  state = advance(state, 3000).state // clock 0

  const { state: next, events } = advance(state, 0, {
    events: [{ kind: 'press', lane: 0, pull: true, gameTime: 0 }], // wanted push, played pull
  })
  assert.equal(next.notes[0].state, 'active', 'still up to be played correctly')
  assert.equal(next.feedback?.text, 'Wrong Way!')
  assert.deepEqual(events, [{ type: 'miss-sound' }])
})

test('a note nobody plays is judged a miss once its beat is gone, and resets combo', () => {
  let state = createInitialState(song('+1')) // holdMs 500, so missed at clock 500
  state = advance(state, 3000).state // clock 0
  state = advance(state, 400).state // clock 400: comfortably still catchable
  assert.equal(state.notes[0].state, 'active')

  const { state: next } = advance(state, 100) // clock 500: gone
  assert.equal(next.notes[0].state, 'miss')
  assert.equal(next.counts.miss, 1)
  assert.equal(next.combo, 0)
  assert.equal(next.feedback?.text, 'Miss')
})

test('waitForNote clamps the clock at the earliest unplayed note until it is hit', () => {
  let state = createInitialState(song('+1'))
  state = advance(state, 3000).state // clock 0, right at the only note

  // A huge dt would normally blow straight past it - waitForNote holds the line.
  const { state: stuck } = advance(state, 10_000, { waitForNote: true })
  assert.equal(stuck.clock, 0)
  assert.equal(
    stuck.notes[0].state,
    'active',
    'never times out while the clock is held at its beat',
  )

  // Play it: the barrier lifts and the clock can move again.
  const { state: played } = advance(stuck, 0, {
    waitForNote: true,
    events: [{ kind: 'press', lane: 0, pull: false, gameTime: 0 }],
  })
  const { state: freed } = advance(played, 10_000, { waitForNote: true })
  assert.equal(
    freed.clock,
    10_000,
    'no more active note left to hold the barrier',
  )
})

test('a mic onset needs two consecutive stable frames before it registers', () => {
  let state = createInitialState(song('+1'))
  state = advance(state, 3195).state // clock 195, so clock - MIC_LATENCY(195) == 0

  const heard: ChordReading = { notes: [chordNote(0, 'push')], stable: true }

  const first = advance(state, 0, { micReading: heard })
  assert.equal(
    first.state.notes[0].state,
    'active',
    'first frame is only a debounce candidate',
  )

  const second = advance(first.state, 0, { micReading: heard })
  assert.equal(second.state.notes[0].state, 'holding')
  assert.equal(
    second.state.notes[0].rating,
    'perfect',
    'graded from clock - MIC_LATENCY, not clock',
  )
  assert.ok(
    second.events.some(
      (e) => e.type === 'log' && e.message.includes('▶ onset'),
    ),
    'the onset is reported as a log event, not printed directly',
  )
})

test('the mic release rides out one silent frame before clearing the held note', () => {
  let state = createInitialState(song('+1'))
  state = advance(state, 3195).state
  const heard: ChordReading = { notes: [chordNote(0, 'push')], stable: true }
  state = advance(state, 0, { micReading: heard }).state
  state = advance(state, 0, { micReading: heard }).state
  assert.equal(state.micNotes.length, 1)

  const silent: ChordReading = { notes: [], stable: true }
  state = advance(state, 0, { micReading: silent }).state
  assert.equal(state.micNotes.length, 1, 'one silent frame is ridden out')

  state = advance(state, 0, { micReading: silent }).state
  assert.equal(state.micNotes.length, 0, 'a second silent frame releases it')
})

test('the song ends once its duration + the end buffer has passed, exactly once', () => {
  const s = song('+1') // duration 500
  let state = createInitialState(s)

  const { state: next, events } = advance(state, 6000) // clock 3000, well past 500 + 1800
  assert.equal(next.finished, true)
  assert.equal(
    next.notes[0].state,
    'miss',
    'the untouched note is judged before the song ends',
  )
  const finished = events.find((e) => e.type === 'finished')
  assert.ok(finished && finished.type === 'finished')
  assert.deepEqual(finished.result, {
    score: 0,
    maxCombo: 0,
    counts: { perfect: 0, good: 0, ok: 0, miss: 1 },
    total: 1,
    accuracy: 0,
  })

  // Once finished, stepEngine is a no-op: same state back, no more events.
  const again = advance(next, 1000)
  assert.equal(again.state, next)
  assert.deepEqual(again.events, [])
})
