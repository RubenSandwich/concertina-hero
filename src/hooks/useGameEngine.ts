import { useCallback, useEffect, useRef, useState } from 'react'
import { KEY_CODES } from '#data/instrument'
import { playNote, playMiss, resumeAudio } from '#audio/sound'
import { detectChord } from '#audio/pitch'
import type { Song } from '#data/songs'
import {
  createInitialState,
  stepEngine,
  type EngineState,
  type InputEvent,
  type GameResult,
} from './gameEngineCore.ts'
export type { GameNote, GameResult } from './gameEngineCore.ts'

interface GameOptions {
  speed?: number
  micEnabled?: boolean
  waitForNote?: boolean
  onFinish?: (result: GameResult) => void
}

// Owns the whole run's *impure* half: rAF, keyboard input, mic sampling, playing
// sounds, logging, calling onFinish. Every rule of the game itself — clock,
// judging, hold accrual, mic debounce, scoring — lives in the stateless
// `stepEngine(state, input)` in gameEngineCore.ts; this hook just gathers one
// frame's input, calls it, and applies the events it hands back.
//
// Options:
//   speed       - playback multiplier (1 = full speed, 0.5 = half-speed practice)
//   micEnabled  - also listen to the mic and treat a played note as a press
//   waitForNote - hold the song on each note until the correct one is played
//   onFinish    - called with the result when the song ends
export function useGameEngine(
  song: Song,
  { speed = 1, micEnabled = false, waitForNote = false, onFinish }: GameOptions = {},
) {
  // `elapsed` mirrors the engine's clock. It is negative during the countdown
  // and drives every re-render (once per animation frame the engine actually
  // advances) — the engine state itself lives in a ref (see conventions.md: keep
  // notes/score/combo/etc. out of React state in the hot loop).
  const [elapsed, setElapsed] = useState(-3000)
  const [paused, setPaused] = useState(false)

  const stateRef = useRef<EngineState>(createInitialState(song))
  const pendingRef = useRef<InputEvent[]>([]) // key/tap presses & releases since the last step
  const rafRef = useRef(0)
  const pausedRef = useRef(false)
  const lastRealRef = useRef(0) // performance.now() at the last rAF tick (processed or not)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  // On-screen buttons press through these, which point at the current run's
  // handlers (rebuilt each run inside the effect). Wrapped in stable callbacks so
  // the keyboard component isn't re-created every frame.
  const pressRef = useRef<(lane: number, pull: boolean) => void>(() => {})
  const releaseRef = useRef<(lane: number) => void>(() => {})
  const togglePauseRef = useRef<() => void>(() => {})
  const pressLane = useCallback((lane: number, pull: boolean) => pressRef.current(lane, pull), [])
  const releaseLane = useCallback((lane: number) => releaseRef.current(lane), [])
  const togglePause = useCallback(() => togglePauseRef.current(), [])

  useEffect(() => {
    // Fresh state for this run.
    stateRef.current = createInitialState(song)
    pendingRef.current = []
    pausedRef.current = false
    lastRealRef.current = performance.now()
    setElapsed(stateRef.current.clock)
    setPaused(false)

    // A key/tap press is graded against the engine's last-known clock rather
    // than extrapolating forward from it: extrapolating (adding the real time
    // since the last step) looks more precise, but it is wrong whenever the
    // clock isn't actually advancing in real time between steps — paused,
    // waiting for a note, or a throttled/backgrounded tab's rAF firing far less
    // often than every frame — and can then overshoot a frozen note's window
    // entirely. Reading the last-known clock is at most one frame stale at a
    // normal frame rate (well inside every hit window) and can never overshoot.
    const doPress = (lane: number, pull: boolean) => {
      if (pausedRef.current) return
      resumeAudio()
      playNote(lane, pull ? 'pull' : 'push')
      pendingRef.current.push({ kind: 'press', lane, pull, gameTime: stateRef.current.clock })
    }
    const doRelease = (lane: number) => {
      pendingRef.current.push({ kind: 'release', lane })
    }

    // Space toggles pause; the HUD Pause button and the pause modal's own
    // controls (✕, backdrop, Escape) call the same path. Pausing just stops the
    // loop from calling stepEngine — there is no clock to rewind on resume.
    const doTogglePause = () => {
      if (stateRef.current.finished) return
      pausedRef.current = !pausedRef.current
      setPaused(pausedRef.current)
    }
    pressRef.current = doPress
    releaseRef.current = doRelease
    togglePauseRef.current = doTogglePause

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) doTogglePause()
        return
      }
      if (e.repeat || pausedRef.current) return
      const lane = KEY_CODES[e.code]
      if (lane === undefined) return
      e.preventDefault()
      doPress(lane, e.shiftKey)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const lane = KEY_CODES[e.code]
      if (lane === undefined) return
      doRelease(lane)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // A backgrounded tab throttles (or fully suspends) rAF, so the dt on the
    // frame it resumes could be huge — enough to judge a wall of notes as
    // missed at once. Reset the anchor on the way back so that frame's dt is
    // just one frame's worth instead of the whole time away. This does not
    // gate *whether* the loop processes a frame — some environments (including
    // automated browser testing) report `document.hidden` true for a page that
    // is otherwise fully interactive, and rAF still fires normally there.
    const onVisibility = () => {
      if (!document.hidden) lastRealRef.current = performance.now()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const loop = () => {
      const real = performance.now()
      if (!pausedRef.current) {
        const dtMs = real - lastRealRef.current
        const micReading = micEnabled ? detectChord() : null
        const { state: next, events } = stepEngine(stateRef.current, {
          dtMs,
          speed,
          waitForNote,
          events: pendingRef.current,
          micReading,
        })
        stateRef.current = next
        pendingRef.current = []

        for (const ev of events) {
          if (ev.type === 'miss-sound') playMiss()
          else if (ev.type === 'log') console.log(ev.message)
          else if (ev.type === 'finished') onFinishRef.current?.(ev.result)
        }

        setElapsed(next.clock)
        lastRealRef.current = real
        if (next.finished) return // stop the loop
      } else {
        lastRealRef.current = real
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [song, speed, micEnabled, waitForNote])

  const s = stateRef.current
  return {
    elapsed,
    countdown: Math.ceil(s.countdownMs / 1000),
    paused,
    micNotes: s.micNotes,
    notes: s.notes,
    score: s.score,
    combo: s.combo,
    maxCombo: s.maxCombo,
    counts: s.counts,
    feedback: s.feedback,
    activeKeys: s.activeKeys,
    pressLane,
    releaseLane,
    togglePause,
  }
}
