import { useCallback, useEffect, useRef, useState } from 'react'
import { KEY_CODES, LANE_NOTES, type Direction } from '#data/instrument'
import { MIC_LATENCY, MIC_WINDOW_SCALE, isPlayable, missTime, noteProgress } from '#data/timing'
import type { Song, Note } from '#data/songs'
import { gradeFor, holdFraction, holdPoints, isSustaining } from '#data/scoring'
import type { Rating, Judgement } from '#data/scoring'
import { playNote, playMiss, resumeAudio } from '#audio/sound'
import { detectChord, aliasesOf } from '#audio/pitch'

const COUNTDOWN_MS = 3000 // "3, 2, 1" before the song starts
const END_BUFFER = 1800 // grace time after the last note before results

// Silent frames before the mic gives up a held note. It buys resilience against a
// dropped frame, but it is also dead time before the same button can be struck
// again: the capture window already takes ~85ms to flush, so each extra frame
// pushes re-articulation further out of reach. At four frames the release took
// ~167ms and every repeated note in Chord Parade was missed; two frames puts it
// near ~120ms, inside the gap a player leaves between two strikes of a button.
const MIC_SILENT_FRAMES = 2

// A chart note plus the mutable per-run play state the loop tracks.
//
// A pressed note becomes 'holding' and stays on the playfield for one beat,
// banking held time for as long as its button is sustained. Releasing early just
// stops the credit — pressing again resumes it. When the beat ends the note is
// finalized into 'hit', scoring its onset grade scaled by the fraction held.
export interface GameNote extends Note {
  state: 'active' | 'holding' | 'hit' | 'miss'
  rating: Judgement | null
  heldMs: number // total time the button was sustained inside the hold window
  creditedTo: number // clock up to which heldMs already accounts for
  holdBonus: number // combo bonus banked at the onset, added when finalized
  judgeElapsed: number
  judgeAt: number // fall-zone progress (0…1+) where the card froze when judged
}

interface Counts {
  perfect: number
  good: number
  ok: number
  miss: number
}

interface Feedback {
  text: string
  rating: Judgement
  id: number
}

interface MicNote {
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

interface GameOptions {
  speed?: number
  micEnabled?: boolean
  waitForNote?: boolean
  onFinish?: (result: GameResult) => void
}

// Owns the whole run: the animation loop, keyboard input, scoring and phases.
// Options:
//   speed       - playback multiplier (1 = full speed, 0.5 = half-speed practice)
//   micEnabled  - also listen to the mic and treat a played note as a press
//   waitForNote - hold the song on each note until the correct one is played
//   onFinish    - called with the result when the song ends
export function useGameEngine(
  song: Song,
  { speed = 1, micEnabled = false, waitForNote = false, onFinish }: GameOptions = {},
) {
  // `elapsed` is milliseconds relative to song start. It is negative during the
  // countdown and drives every re-render (once per animation frame).
  const [elapsed, setElapsed] = useState(-COUNTDOWN_MS)
  const [paused, setPaused] = useState(false)

  const startRef = useRef(0)
  const hiddenAtRef = useRef(0)
  const rafRef = useRef(0)
  const countdownRef = useRef(Math.ceil(COUNTDOWN_MS / 1000))
  const pausedRef = useRef(false)
  const pausedAtRef = useRef(0)
  const notesRef = useRef<GameNote[]>([])
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const countsRef = useRef<Counts>({ perfect: 0, good: 0, ok: 0, miss: 0 })
  const feedbackRef = useRef<Feedback | null>(null)
  const feedbackIdRef = useRef(0)
  const activeKeysRef = useRef<Record<number, Direction>>({}) // lane index -> direction while held
  const micNotesRef = useRef<MicNote[]>([]) // every note the mic hears right now
  const micHeldRef = useRef<Set<string>>(new Set()) // "lane:type" already pressed, still sounding
  const micCandRef = useRef<Map<string, number>>(new Map()) // "lane:type" -> frames heard (debounce)
  const micSilentRef = useRef(0)
  const micDebugAtRef = useRef(0)
  const finishedRef = useRef(false)
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
    notesRef.current = song.notes.map((n): GameNote => ({
      ...n,
      state: 'active', // 'active' | 'holding' | 'hit' | 'miss'
      rating: null, // 'perfect' | 'good' | 'ok' | 'miss'
      heldMs: 0,
      creditedTo: 0,
      holdBonus: 0,
      judgeElapsed: 0,
      judgeAt: 0,
    }))
    scoreRef.current = 0
    comboRef.current = 0
    maxComboRef.current = 0
    countsRef.current = { perfect: 0, good: 0, ok: 0, miss: 0 }
    feedbackRef.current = null
    activeKeysRef.current = {}
    micNotesRef.current = []
    micHeldRef.current = new Set()
    micCandRef.current = new Map()
    micSilentRef.current = 0
    micDebugAtRef.current = 0
    finishedRef.current = false
    pausedRef.current = false
    pausedAtRef.current = 0
    startRef.current = performance.now() + COUNTDOWN_MS
    hiddenAtRef.current = 0
    setElapsed(-COUNTDOWN_MS)
    setPaused(false)

    const setFeedback = (text: string, rating: Judgement) => {
      feedbackIdRef.current += 1
      feedbackRef.current = { text, rating, id: feedbackIdRef.current }
    }

    // Real elapsed time is scaled by `speed` to get the game clock, so a lower
    // speed slows note motion and spacing together.
    const gameTime = () => (performance.now() - startRef.current) * speed

    // Every note sustains for exactly one beat, so its hold window is
    // [note.time, note.time + holdMs).
    const holdMs = 60000 / (song.bpm * (song.subdivision || 1))

    const judge = (note: GameNote, now: number, rating: Judgement) => {
      note.state = rating === 'miss' ? 'miss' : 'hit'
      note.rating = rating
      note.judgeElapsed = now
      note.judgeAt = noteProgress(note.time - now)
    }

    // Bank the time a held note was sustained since we last looked at it. A
    // released (or re-grabbed) note simply stops (or resumes) earning credit.
    const accrueHold = (note: GameNote, clock: number) => {
      const held = isSustaining(
        note.lane,
        note.type,
        activeKeysRef.current,
        micEnabled ? micNotesRef.current : [],
      )
      if (held) {
        const from = Math.max(note.creditedTo, note.time)
        const to = Math.min(clock, note.time + holdMs)
        if (to > from) note.heldMs += to - from
      }
      note.creditedTo = clock
    }

    // The hold window closed: score the onset grade, scaled by how much of the
    // beat was actually held, plus the combo bonus banked at the press.
    const finalizeHold = (note: GameNote, clock: number) => {
      const rating = note.rating as Rating
      scoreRef.current += holdPoints(rating, holdFraction(note.heldMs, holdMs)) + note.holdBonus
      note.state = 'hit'
      note.judgeElapsed = clock
      note.judgeAt = noteProgress(note.time - clock)
    }

    // The mic hears a *pitch*, not a button. A concertina may sound the same note
    // in more than one place, and two buttons tuned close enough are one peak to
    // the detector either way — so a heard note stands for every button it could
    // have come from (`aliasesOf`).
    //
    // Resolve that by asking the chart: press whichever of them the song is
    // waiting for right now. If the song wants none of them, press the one that
    // was heard, so a wrong-way press is still judged as one.
    const micPresses = (lane: number, type: Direction): { lane: number; type: Direction }[] => {
      const aliases = aliasesOf(lane, type)
      if (aliases.length === 1) return aliases
      const now = gameTime() - MIC_LATENCY
      const wanted = aliases.filter((a) =>
        notesRef.current.some(
          (n) =>
            n.lane === a.lane &&
            n.type === a.type &&
            n.state === 'active' &&
            isPlayable(now, n.time, holdMs),
        ),
      )
      return wanted.length ? wanted : [{ lane, type }]
    }

    // `fromMic` presses are rewound by MIC_LATENCY: the note was already sounding
    // that long before the detector could name it, so it is graded — and starts
    // banking its hold — from when it was actually played, not when it was heard.
    const registerPress = (lane: number, wantPull: boolean, fromMic = false) => {
      const clock = gameTime()
      const now = fromMic ? clock - MIC_LATENCY : clock
      const windowScale = fromMic ? MIC_WINDOW_SCALE : 1

      // The oldest still-playable note in this lane. Notes are stored in time
      // order, so the first match is the one you owe — a note you're late on is
      // claimed before an early press can steal the note after it.
      let best: GameNote | null = null
      for (const n of notesRef.current) {
        if (n.lane !== lane || n.state !== 'active') continue
        if (!isPlayable(now, n.time, holdMs)) continue
        best = n
        break
      }

      // Nothing in range: treat as a harmless "just playing around" press.
      if (!best) return

      const wantType: Direction = wantPull ? 'pull' : 'push'
      if (best.type !== wantType) {
        // Wrong bellows direction. In wait-for-note mode the note stays put so
        // you can try again; otherwise it counts as a miss.
        setFeedback('Wrong Way!', 'miss')
        playMiss()
        if (!waitForNote) {
          judge(best, clock, 'miss') // the card pops where it is *now*, not where it was heard
          comboRef.current = 0
          countsRef.current.miss += 1
        }
        return
      }

      const rating: Rating = gradeFor(best.time - now, windowScale)

      // The press earns the grade and the combo right away; the note now sustains
      // and its points are settled when the hold window closes. Pressing late
      // forfeits the beat already gone, so the hold can no longer score in full.
      comboRef.current += 1
      maxComboRef.current = Math.max(maxComboRef.current, comboRef.current)
      best.state = 'holding'
      best.rating = rating
      best.heldMs = 0
      best.creditedTo = Math.max(now, best.time)
      best.holdBonus = Math.floor(comboRef.current / 10) * 5
      countsRef.current[rating] += 1
      setFeedback(rating.toUpperCase() + '!', rating)
    }

    // Space toggles pause. Pausing freezes the game clock; resuming shifts the
    // start time forward by however long we were paused so nothing is missed.
    const doTogglePause = () => {
      if (finishedRef.current) return
      if (pausedRef.current) {
        startRef.current += performance.now() - pausedAtRef.current
        pausedRef.current = false
        setPaused(false)
      } else {
        pausedRef.current = true
        pausedAtRef.current = performance.now()
        setPaused(true)
      }
    }

    // The shared press/release path for every input — a key, or a tap on an
    // on-screen button. A press sounds the synth, holds the lane, and grades the
    // note; releasing just stops the hold.
    const doPress = (lane: number, pull: boolean) => {
      if (pausedRef.current) return
      resumeAudio()
      activeKeysRef.current[lane] = pull ? 'pull' : 'push'
      playNote(lane, pull ? 'pull' : 'push')
      registerPress(lane, pull)
    }
    const doRelease = (lane: number) => {
      delete activeKeysRef.current[lane]
    }
    pressRef.current = doPress
    releaseRef.current = doRelease
    togglePauseRef.current = doTogglePause

    const onKeyDown = (e: KeyboardEvent) => {
      // Space toggles pause; the HUD Pause button and the pause modal's own
      // controls (✕, backdrop, Escape) call the same path, so pause is never
      // keyboard-only.
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

    // Pause the game clock while the tab is hidden so alt-tabbing (or a
    // throttled background tab) doesn't dump a wall of "miss" notes at once.
    const onVisibility = () => {
      if (pausedRef.current) return
      if (document.hidden) {
        hiddenAtRef.current = performance.now()
      } else if (hiddenAtRef.current) {
        startRef.current += performance.now() - hiddenAtRef.current
        hiddenAtRef.current = 0
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const loop = () => {
      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      let clock = gameTime()

      // Real-time 3-2-1 countdown (unaffected by playback speed).
      const realRemaining = startRef.current - performance.now()
      countdownRef.current = realRemaining > 0 ? Math.ceil(realRemaining / 1000) : 0

      // Wait-for-note: hold the clock at the earliest un-hit note so the song
      // doesn't advance past it until it's played correctly.
      if (waitForNote) {
        let barrier = Infinity
        for (const n of notesRef.current) {
          if (n.state === 'active' && n.time < barrier) barrier = n.time
        }
        if (barrier !== Infinity && clock > barrier) {
          startRef.current += (clock - barrier) / speed
          clock = barrier
        }
      }

      // Only give up on a note once its beat is all but over and nothing was
      // played for it. Until then a late press can still claim it.
      for (const n of notesRef.current) {
        if (n.state === 'active' && clock >= missTime(n.time, holdMs)) {
          judge(n, clock, 'miss')
          comboRef.current = 0
          countsRef.current.miss += 1
          setFeedback('Miss', 'miss')
        }
      }

      // Microphone: every note the mic hears is a held button. A note that has
      // just started sounding is an onset — a press — and one that keeps sounding
      // sustains its note, exactly as a held key would. Chords work because the
      // detector reports the whole set.
      const reading = micEnabled ? detectChord() : null
      if (reading) {
        const heard = reading.notes

        // Throttled debug readout (~5x/sec) to help calibrate a real instrument.
        const rt = performance.now()
        if (heard.length && reading.stable && rt - micDebugAtRef.current > 200) {
          micDebugAtRef.current = rt
          const played = heard.map((n) => `${n.name} ${n.type} (button ${n.lane + 1})`).join(' + ')
          console.log(`[mic] ${played}`)
        }

        // An empty reading has no phantoms to guard against, so silence is always
        // believed — gating it on stability would stall the release while a note
        // decays, and the same button could not be struck again in time.
        //
        // A *non-empty* reading from a window caught mid-transition is another
        // matter: it holds the old note's tail beside the new note's attack, and
        // `analyzeChord` reads notes out of it that were never played. Keep
        // sustaining what is already held, but start nothing new on it.
        if (!heard.length) {
          // Ride out brief dropouts so a sustained note doesn't stutter.
          micSilentRef.current += 1
          if (micSilentRef.current >= MIC_SILENT_FRAMES) {
            micNotesRef.current = []
            micHeldRef.current.clear()
            micCandRef.current.clear()
          }
        } else if (reading.stable) {
          micSilentRef.current = 0
          // A heard note sustains every button it could have come from. Only one
          // of them will have a note holding, and the others cost nothing.
          micNotesRef.current = heard.flatMap((n) =>
            aliasesOf(n.lane, n.type).map(({ lane, type }) => ({
              lane,
              type,
              name: LANE_NOTES[lane][type].name,
            })),
          )
          const sounding = new Set(heard.map((n) => n.lane + ':' + n.type))

          // A note must be heard for a couple of frames before it counts, which
          // rides out a stray frame of misdetection.
          for (const key of sounding) {
            if (micHeldRef.current.has(key)) continue
            const frames = (micCandRef.current.get(key) ?? 0) + 1
            micCandRef.current.set(key, frames)
            if (frames < 2) continue
            micCandRef.current.delete(key)
            micHeldRef.current.add(key)
            const [laneStr, typeStr] = key.split(':')
            for (const { lane, type } of micPresses(Number(laneStr), typeStr as Direction)) {
              registerPress(lane, type === 'pull', true)
            }
            // An onset, not necessarily a hit — registerPress decides whether any
            // note was actually there to claim.
            console.log(`[mic] ▶ onset button ${Number(laneStr) + 1} ${typeStr}`)
          }

          // Notes that stopped sounding release, and may be struck again later.
          for (const key of [...micCandRef.current.keys()]) {
            if (!sounding.has(key)) micCandRef.current.delete(key)
          }
          for (const key of [...micHeldRef.current]) {
            if (!sounding.has(key)) micHeldRef.current.delete(key)
          }
        }
        // Otherwise the window straddles a note boundary: believe none of it.
      }

      // Sustained notes bank held time (using this frame's keys and mic reading)
      // and settle once their beat has run out.
      for (const n of notesRef.current) {
        if (n.state !== 'holding') continue
        accrueHold(n, clock)
        if (clock >= n.time + holdMs) finalizeHold(n, clock)
      }

      setElapsed(clock)

      if (!finishedRef.current && clock > song.duration + END_BUFFER) {
        finishedRef.current = true
        const total = song.notes.length
        const c = countsRef.current
        const hits = c.perfect + c.good + c.ok
        onFinishRef.current?.({
          score: scoreRef.current,
          maxCombo: maxComboRef.current,
          counts: { ...c },
          total,
          accuracy: total ? Math.round((hits / total) * 100) : 0,
        })
        return // stop the loop
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

  return {
    elapsed,
    countdown: countdownRef.current,
    paused,
    micNotes: micNotesRef.current,
    notes: notesRef.current,
    score: scoreRef.current,
    combo: comboRef.current,
    maxCombo: maxComboRef.current,
    counts: countsRef.current,
    feedback: feedbackRef.current,
    activeKeys: activeKeysRef.current,
    pressLane,
    releaseLane,
    togglePause,
  }
}
