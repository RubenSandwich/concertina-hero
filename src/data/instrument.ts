// The toy concertina itself: its seven buttons and the live note map the synth
// and mic detector read. This is the pure instrument model — no persistence, no
// side effects. Saved tunings are applied on top of it from `presets.ts`.

// Bellows direction: push = squeeze in, pull = draw out.
export type Direction = 'push' | 'pull'

// The two directions, for iterating a button's push/pull pair.
export const DIRECTIONS = ['push', 'pull'] as const

// A single button/direction sound: its note name and frequency in Hz.
export interface NoteInfo {
  name: string
  freq: number
}

// One concertina button: the notes it sounds on push vs pull.
export interface LaneNote {
  push: NoteInfo
  pull: NoteInfo
}

// Seven lanes = the seven toy-concertina buttons, played with the number keys 1-7.
export const LANE_LABELS = ['1', '2', '3', '4', '5', '6', '7']

// Bright, saturated "cut paper" color per button (1-7).
export const LANE_COLORS = [
  '#ff5d5d', // 1 - coral red
  '#ff924c', // 2 - orange
  '#ffd23f', // 3 - sunshine yellow
  '#8ac926', // 4 - leaf green
  '#2ec4b6', // 5 - teal
  '#4cc9f0', // 6 - sky blue
  '#b892ff', // 7 - grape purple
]

// Map physical key codes to lane indices. Using `event.code` means the lane is
// the same whether or not Shift is held (Shift is what distinguishes push/pull).
// Both the number row and the numpad work. The value is `undefined` for any
// other key, so callers can ignore presses that aren't a button.
export const KEY_CODES: Record<string, number | undefined> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  Numpad5: 4,
  Numpad6: 5,
  Numpad7: 6,
}

// Each button is bisonoric: it sounds a different note when you push (squeeze in)
// vs pull (draw out), exactly like a real diatonic concertina.
//   button 1: C (middle C) / D      button 5: E (high) / D (high)
//   button 2: E / F                  button 6: G (high) / F (high)
//   button 3: G / A                  button 7: B (high) / A (high)
//   button 4: C (high) / B
// The default button/note map. Kept aside so a custom tuning can be reset.
const DEFAULT_LANE_NOTES: LaneNote[] = [
  { push: { name: 'C', freq: 261.63 }, pull: { name: 'D', freq: 293.66 } },
  { push: { name: 'E', freq: 329.63 }, pull: { name: 'F', freq: 349.23 } },
  { push: { name: 'G', freq: 392.0 }, pull: { name: 'A', freq: 440.0 } },
  { push: { name: 'C', freq: 523.25 }, pull: { name: 'B', freq: 493.88 } },
  { push: { name: 'E', freq: 659.25 }, pull: { name: 'D', freq: 587.33 } },
  { push: { name: 'G', freq: 783.99 }, pull: { name: 'F', freq: 698.46 } },
  { push: { name: 'B', freq: 987.77 }, pull: { name: 'A', freq: 880.0 } },
]

// The *active* map used by the synth and the mic detector. It's a live-mutated
// copy of the defaults (same object identity), so recalibrating a button's
// frequency is picked up immediately everywhere LANE_NOTES is read.
export const LANE_NOTES: LaneNote[] = DEFAULT_LANE_NOTES.map((n) => ({
  push: { ...n.push },
  pull: { ...n.pull },
}))

// A positive numeric frequency, or null if the value isn't usable.
export function validFreq(value: unknown): number | null {
  const f = Number(value)
  return Number.isFinite(f) && f > 0 ? f : null
}

// Bulk-apply frequencies from a 7-row array of { push: { freq }, pull: { freq } }.
// Names are left untouched — they describe the instrument's fixed layout.
export function setNoteFrequencies(rows: unknown): void {
  if (!Array.isArray(rows)) return
  LANE_NOTES.forEach((note, i) => {
    for (const type of DIRECTIONS) {
      const f = rows[i]?.[type] ? validFreq(rows[i][type].freq) : null
      if (f) note[type].freq = f
    }
  })
}

// A deep copy of the built-in default note map — the starting point for a new
// preset and the target of the editor's "Reset".
export function getDefaultNotes(): LaneNote[] {
  return DEFAULT_LANE_NOTES.map((n) => ({ push: { ...n.push }, pull: { ...n.pull } }))
}
