// Lightweight Web Audio "toy concertina" synth. No external assets needed.

import { LANE_NOTES, type Direction } from '../instrument/instrument.ts'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  return ctx
}

// Browsers start the AudioContext suspended until a user gesture. Call this
// from a click/keydown so sound is allowed to play.
export function resumeAudio(): void {
  const c = getCtx()
  if (c && c.state === 'suspended') c.resume()
}

// Expose the shared AudioContext so the mic pitch detector can hang an analyser
// off the same graph.
export function getAudioContext(): AudioContext | null {
  return getCtx()
}

// Play a short reedy concertina note. Each button sounds a different pitch on
// push vs pull, taken straight from the button/note map in constants.
export function playNote(lane: number, type: Direction): void {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const note = LANE_NOTES[lane]?.[type]
  const freq = note ? note.freq : 440

  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.22, now + 0.012)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.38)
  master.connect(c.destination)

  // Two slightly detuned reeds give that wheezy concertina timbre.
  for (const detune of [-6, 6]) {
    const osc = c.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now)
    osc.detune.setValueAtTime(detune, now)
    osc.connect(master)
    osc.start(now)
    osc.stop(now + 0.4)
  }
}

// A soft paper "thunk" for missed / wrong-direction presses.
export function playMiss(): void {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.14, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
  gain.connect(c.destination)

  const osc = c.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(150, now)
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.18)
  osc.connect(gain)
  osc.start(now)
  osc.stop(now + 0.2)
}
