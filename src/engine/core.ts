// The stateless core of the game: one function, `stepEngine`, that turns
// `(state, input)` into `(state, events)`. It owns every rule of the game — the
// clock, hit/miss judging, hold accrual, the mic's onset debounce, scoring — and
// touches nothing outside its arguments: no DOM, no audio, no `performance.now()`,
// no `console.log`. That is what makes it a plain function you can call from a
// test with made-up input and assert on the state it hands back.
//
// `useGameEngine.ts` is the shell around it: it owns everything impure (rAF,
// keyboard/mic listeners, playing sounds, logging, calling onFinish) and reduces
// to "gather this frame's input, call stepEngine, apply the events it returned".
//
// `state` is mutated and returned as the same object where doing so is cheap
// (note records, the held-key map, the mic debounce sets) — this is a hot 60fps
// path and the notes array can run into the hundreds. Only the top-level state
// container is replaced each call, so callers always get a new `EngineState`
// reference to store, even though most of what it points to is reused in place.

import { LANE_NOTES, type Direction } from '../instrument/instrument.ts'
import {
  MIC_LATENCY,
  MIC_WINDOW_SCALE,
  isPlayable,
  missTime,
  noteProgress,
} from '../scoring/timing.ts'
import type { Song, ChartNote } from '../songs/songs.ts'
import {
  gradeFor,
  holdFraction,
  holdPoints,
  isSustaining,
} from '../scoring/scoring.ts'
import type { Rating, Judgement } from '../scoring/scoring.ts'
import { aliasesOf, type ChordReading } from '../audio/pitch.ts'

const COUNTDOWN_MS = 3000 // "3, 2, 1" before the song starts
const END_BUFFER = 1800 // grace time after the last note before results

// Silent frames before the mic gives up a held note — see useGameEngine's header
// comment for why this is 2.
const MIC_SILENT_FRAMES = 2

// How often (ms of game clock) the mic debug readout may log, so a held chord
// doesn't spam a line every frame.
const MIC_DEBUG_THROTTLE_MS = 200

// A note's play-state lifecycle: every note starts 'active' (falling, not yet
// judged); a press turns it 'holding' (correctly struck, sustain in progress);
// it settles to 'hit' once its beat's hold window ends, or 'miss' if its window
// passed with no press at all. See useGameEngine's header comment for the full
// hold/finalize lifecycle.
export const NoteState = {
  Active: 'active',
  Holding: 'holding',
  Hit: 'hit',
  Miss: 'miss',
} as const
export type NoteState = (typeof NoteState)[keyof typeof NoteState]

// A chart note plus the mutable per-run play state the engine tracks. See
// useGameEngine's header comment for the hold/finalize lifecycle.
export interface GameNote extends ChartNote {
  state: NoteState
  rating: Judgement | null
  heldMs: number
  creditedTo: number
  holdBonus: number
  judgeElapsed: number
  judgeAt: number
}

interface Counts {
  perfect: number
  good: number
  ok: number
  miss: number
}

export interface Feedback {
  text: string
  rating: Judgement
  id: number
}

export interface MicNote {
  lane: number
  type: Direction
  name: string
}

// The payload handed to onFinish (and rendered on the Results screen).
export interface GameResult {
  score: number
  maxCombo: number
  counts: Counts
  total: number
  accuracy: number
}

// One key/tap press or release, timestamped by the shell at the instant it
// happened (converted to game time), so grading is exact even though it is only
// applied on the next `stepEngine` call rather than the instant it occurred.
export type InputEvent =
  | { kind: 'press'; lane: number; pull: boolean; gameTime: number }
  | { kind: 'release'; lane: number }

export interface EngineInput {
  dtMs: number // real ms elapsed since the previous step (0 while paused/hidden — just don't call step)
  speed: number
  waitForNote: boolean
  events: InputEvent[] // key/tap presses & releases queued since the last step, in order
  micReading: ChordReading | null // this frame's detectChord() sample, or null when the mic is off
}

// Side effects the shell should perform after applying a step's new state.
export type EngineEvent =
  | { type: 'miss-sound' }
  | { type: 'log'; message: string }
  | { type: 'finished'; result: GameResult }

export interface EngineState {
  song: Song
  holdMs: number // every note sustains for exactly one beat
  clock: number // game time, ms, relative to song start (negative during the countdown)
  countdownMs: number // real ms left before the song starts, for the "3, 2, 1" display
  finished: boolean
  notes: GameNote[]
  score: number
  combo: number
  maxCombo: number
  counts: Counts
  feedback: Feedback | null
  feedbackId: number
  activeKeys: Record<number, Direction> // lane -> direction while a key/tap is held
  micNotes: MicNote[] // every note the mic currently sustains (with aliases expanded)
  micHeld: Set<string> // "lane:type" already pressed, still sounding
  micCand: Map<string, number> // "lane:type" -> frames heard (debounce before it counts as a press)
  micSilent: number
  micDebugAt: number // last game-clock time the mic debug line was logged
}

// A fresh run: notes reset to 'active', clock at -COUNTDOWN_MS, everything else zeroed.
export function createInitialState(song: Song): EngineState {
  return {
    song,
    holdMs: 60000 / (song.bpm * (song.subdivision || 1)),
    clock: -COUNTDOWN_MS,
    countdownMs: COUNTDOWN_MS,
    finished: false,
    notes: song.notes.map((n): GameNote => ({
      ...n,
      state: NoteState.Active,
      rating: null,
      heldMs: 0,
      creditedTo: 0,
      holdBonus: 0,
      judgeElapsed: 0,
      judgeAt: 0,
    })),
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { perfect: 0, good: 0, ok: 0, miss: 0 },
    feedback: null,
    feedbackId: 0,
    activeKeys: {},
    micNotes: [],
    micHeld: new Set(),
    micCand: new Map(),
    micSilent: 0,
    micDebugAt: 0,
  }
}

function setFeedback(
  state: EngineState,
  text: string,
  rating: Judgement,
): void {
  state.feedbackId += 1
  state.feedback = { text, rating, id: state.feedbackId }
}

// The mic hears a *pitch*, not a button — resolve it to whichever button the
// chart is waiting for right now (or the heard one, if it wants none of them).
// See useGameEngine's original header comment for the full reasoning.
function micPresses(
  state: EngineState,
  lane: number,
  type: Direction,
  now: number,
): { lane: number; type: Direction }[] {
  const aliases = aliasesOf(lane, type)
  if (aliases.length === 1) return aliases
  const wanted = aliases.filter((a) =>
    state.notes.some(
      (n) =>
        n.lane === a.lane &&
        n.type === a.type &&
        n.state === NoteState.Active &&
        isPlayable(now, n.time, state.holdMs),
    ),
  )
  return wanted.length ? wanted : [{ lane, type }]
}

// Grade a press against the oldest still-playable note in its lane. Notes are
// stored in time order, so the first match is the one owed. `windowScale` widens
// the hit windows for a mic press (see MIC_WINDOW_SCALE).
function registerPress(
  state: EngineState,
  lane: number,
  wantPull: boolean,
  now: number,
  windowScale: number,
  events: EngineEvent[],
): void {
  let best: GameNote | null = null
  for (const n of state.notes) {
    if (n.lane !== lane || n.state !== NoteState.Active) continue
    if (!isPlayable(now, n.time, state.holdMs)) continue
    best = n
    break
  }
  if (!best) return // nothing in range: a harmless "just playing around" press

  const wantType: Direction = wantPull ? 'pull' : 'push'
  if (best.type !== wantType) {
    // Wrong bellows direction: flag it, but leave the note up so it can still be
    // played correctly — see registerPress's original comment for why.
    setFeedback(state, 'Wrong Way!', 'miss')
    events.push({ type: 'miss-sound' })
    return
  }

  const rating: Rating = gradeFor(best.time - now, windowScale)
  state.combo += 1
  state.maxCombo = Math.max(state.maxCombo, state.combo)
  best.state = NoteState.Holding
  best.rating = rating
  best.heldMs = 0
  best.creditedTo = Math.max(now, best.time)
  best.holdBonus = Math.floor(state.combo / 10) * 5
  state.counts[rating] += 1
  setFeedback(state, rating.toUpperCase() + '!', rating)
}

// Advance the engine by one frame. Pure: the same `(state, input)` always
// produces the same result. `state` is mutated and returned as the new
// top-level object (see the file header for what "mutated" means here).
export function stepEngine(
  prev: EngineState,
  input: EngineInput,
): { state: EngineState; events: EngineEvent[] } {
  const events: EngineEvent[] = []
  if (prev.finished) return { state: prev, events }

  const state: EngineState = { ...prev }
  const { song, holdMs } = state
  state.clock = prev.clock + input.dtMs * input.speed
  state.countdownMs = Math.max(0, prev.countdownMs - input.dtMs)

  // Apply this frame's queued key/tap presses & releases, in the order they
  // happened. Each press already carries the exact game time it occurred at.
  for (const ev of input.events) {
    if (ev.kind === 'release') {
      delete state.activeKeys[ev.lane]
    } else {
      state.activeKeys[ev.lane] = ev.pull ? 'pull' : 'push'
      registerPress(state, ev.lane, ev.pull, ev.gameTime, 1, events)
    }
  }

  // Wait-for-note: hold the clock at the earliest un-hit note so the song
  // doesn't advance past it until it's played correctly.
  if (input.waitForNote) {
    let barrier = Infinity
    for (const n of state.notes)
      if (n.state === NoteState.Active && n.time < barrier) barrier = n.time
    if (barrier !== Infinity && state.clock > barrier) state.clock = barrier
  }

  // Only give up on a note once its beat is all but over and nothing was played
  // for it. Until then a late press can still claim it.
  for (const n of state.notes) {
    if (
      n.state === NoteState.Active &&
      state.clock >= missTime(n.time, holdMs)
    ) {
      n.state = NoteState.Miss
      n.rating = 'miss'
      n.judgeElapsed = state.clock
      n.judgeAt = noteProgress(n.time - state.clock)
      state.combo = 0
      state.counts.miss += 1
      setFeedback(state, 'Miss', 'miss')
    }
  }

  // Microphone: every note the mic hears is a held button (see useGameEngine's
  // original header comment for the full stability/debounce reasoning).
  const reading = input.micReading
  if (reading) {
    const heard = reading.notes

    if (
      heard.length &&
      reading.stable &&
      state.clock - state.micDebugAt > MIC_DEBUG_THROTTLE_MS
    ) {
      state.micDebugAt = state.clock
      const played = heard
        .map((n) => `${n.name} ${n.type} (button ${n.lane + 1})`)
        .join(' + ')
      events.push({ type: 'log', message: `[mic] ${played}` })
    }

    if (!heard.length) {
      // Ride out brief dropouts so a sustained note doesn't stutter.
      state.micSilent += 1
      if (state.micSilent >= MIC_SILENT_FRAMES) {
        state.micNotes = []
        state.micHeld = new Set()
        state.micCand = new Map()
      }
    } else if (reading.stable) {
      state.micSilent = 0
      state.micNotes = heard.flatMap((n) =>
        aliasesOf(n.lane, n.type).map(({ lane, type }) => ({
          lane,
          type,
          name: LANE_NOTES[lane][type].name,
        })),
      )
      const sounding = new Set(heard.map((n) => n.lane + ':' + n.type))

      // A note must be heard for a couple of frames before it counts.
      for (const key of sounding) {
        if (state.micHeld.has(key)) continue
        const frames = (state.micCand.get(key) ?? 0) + 1
        state.micCand.set(key, frames)
        if (frames < 2) continue
        state.micCand.delete(key)
        state.micHeld.add(key)
        const [laneStr, typeStr] = key.split(':')
        const lane = Number(laneStr)
        const type = typeStr as Direction
        const now = state.clock - MIC_LATENCY
        for (const p of micPresses(state, lane, type, now)) {
          registerPress(
            state,
            p.lane,
            p.type === 'pull',
            now,
            MIC_WINDOW_SCALE,
            events,
          )
        }
        events.push({
          type: 'log',
          message: `[mic] ▶ onset button ${lane + 1} ${type}`,
        })
      }

      // Notes that stopped sounding release, and may be struck again later.
      for (const key of [...state.micCand.keys()])
        if (!sounding.has(key)) state.micCand.delete(key)
      for (const key of [...state.micHeld])
        if (!sounding.has(key)) state.micHeld.delete(key)
    }
    // Otherwise the window straddles a note boundary: believe none of it.
  }

  // Sustained notes bank held time and settle once their beat has run out.
  for (const n of state.notes) {
    if (n.state !== NoteState.Holding) continue
    const held = isSustaining(n.lane, n.type, state.activeKeys, state.micNotes)
    if (held) {
      const from = Math.max(n.creditedTo, n.time)
      const to = Math.min(state.clock, n.time + holdMs)
      if (to > from) n.heldMs += to - from
    }
    n.creditedTo = state.clock
    if (state.clock >= n.time + holdMs) {
      const rating = n.rating as Rating
      state.score +=
        holdPoints(rating, holdFraction(n.heldMs, holdMs)) + n.holdBonus
      n.state = NoteState.Hit
      n.judgeElapsed = state.clock
      n.judgeAt = noteProgress(n.time - state.clock)
    }
  }

  if (state.clock > song.duration + END_BUFFER) {
    state.finished = true
    const total = song.notes.length
    const c = state.counts
    const hits = c.perfect + c.good + c.ok
    events.push({
      type: 'finished',
      result: {
        score: state.score,
        maxCombo: state.maxCombo,
        counts: { ...c },
        total,
        accuracy: total ? Math.round((hits / total) * 100) : 0,
      },
    })
  }

  return { state, events }
}
