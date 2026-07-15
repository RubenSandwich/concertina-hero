// The concertina itself: the buttons of the currently selected instrument and the
// live note map the synth and mic detector read. The geometry, colours, keys and
// default notes all come from a `layout` (see layout.ts); this module holds the
// *active* instrument and the live, mutable maps derived from it. Saved tunings
// are applied on top from `presets.ts`.

import {
  LAYOUTS,
  DEFAULT_INSTRUMENT,
  type InstrumentSize,
  type InstrumentLayout,
  type ButtonSpec,
} from './layout.ts'

export { INSTRUMENT_SIZES } from './layout.ts'
export type { InstrumentSize, ButtonSpec } from './layout'

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

// ---------------------------------------------------------------------------
// Live, mutable maps derived from the active layout.
//
// These are exported as stable array/object identities and mutated *in place*
// when the instrument (or a tuning) changes, so every consumer that reads them
// live — the game loop, the mic detector, the synth — picks up the change with
// no re-import. The arrays' *length* changes with the instrument size, which is
// why they are rebuilt in place rather than reassigned.
// ---------------------------------------------------------------------------

// The active button geometry/colours/keys/labels (index === lane).
export const LANE_BUTTONS: ButtonSpec[] = []

// The live push/pull note map read by the synth and mic detector.
export const LANE_NOTES: LaneNote[] = []

// Per-lane paper-craft colour.
export const LANE_COLORS: string[] = []

// One button note, as one entry in a direction's dictionary.
export interface NoteCandidate {
  lane: number
  type: Direction
  name: string
  freq: number
}

// The buttons of each direction, **ordered by frequency**. The mic detector takes
// the lowest-pitched candidate first (a note's overtones only ever lie above it),
// and that rule is about pitch, not lane index — the two coincide under the
// default tuning, but a custom one may invert them.
//
// Rebuilt whenever the tuning or the instrument changes, and nowhere else.
export const NOTE_CANDIDATES: Record<Direction, NoteCandidate[]> = {
  push: [],
  pull: [],
}

// Map physical key codes to lane indices, from the active layout's spatial grid
// (`Q W E … /`, Decision 4). Using `event.code` means the lane is the same
// whatever the OS keyboard layout, and whether or not Shift is held (Shift is what
// distinguishes push/pull). Only the active instrument's keys are present, so keys
// past its size resolve to `undefined` and are ignored, like any non-button key.
export const KEY_CODES: Record<string, number | undefined> = {}

function rebuildCandidates(): void {
  for (const type of DIRECTIONS) {
    NOTE_CANDIDATES[type] = LANE_NOTES.map((note, lane) => ({
      lane,
      type,
      name: note[type].name,
      freq: note[type].freq,
    })).sort((a, b) => a.freq - b.freq)
  }
}

// Rebuild every derived map in place from a layout. Frequencies come from the
// layout's defaults; a saved preset is re-applied on top afterwards.
function applyLayout(layout: InstrumentLayout): void {
  LANE_BUTTONS.length = 0
  LANE_NOTES.length = 0
  LANE_COLORS.length = 0
  for (const k in KEY_CODES) delete KEY_CODES[k]
  for (const b of layout.buttons) {
    LANE_BUTTONS.push(b)
    LANE_NOTES.push({ push: { ...b.push }, pull: { ...b.pull } })
    LANE_COLORS.push(b.color)
    KEY_CODES[b.key] = b.lane
  }
  rebuildCandidates()
}

// ---------------------------------------------------------------------------
// The active instrument (a global setting, persisted to localStorage).
// ---------------------------------------------------------------------------

const INSTRUMENT_KEY = 'concertina-instrument'
let activeInstrument: InstrumentSize = DEFAULT_INSTRUMENT

function isSize(value: unknown): value is InstrumentSize {
  return value === 7 || value === 10 || value === 20 || value === 30
}

// The instrument size the player last selected (defaults to the 7-button).
export function getActiveInstrument(): InstrumentSize {
  return activeInstrument
}

// The active layout — geometry + button specs — for the playfield and keyboard.
export function getActiveLayout(): InstrumentLayout {
  return LAYOUTS[activeInstrument]
}

// Switch the active instrument: rebuild every derived map from its layout and
// persist the choice. Returns the new size.
export function setActiveInstrument(size: InstrumentSize): InstrumentSize {
  activeInstrument = size
  applyLayout(LAYOUTS[size])
  try {
    localStorage.setItem(INSTRUMENT_KEY, String(size))
  } catch {
    /* storage unavailable — ignore */
  }
  return size
}

// Apply whichever instrument was selected last time. Called once at startup
// (main.tsx) before the saved tuning is applied.
export function applyActiveInstrument(): InstrumentSize {
  let saved: InstrumentSize = DEFAULT_INSTRUMENT
  try {
    const raw = Number(localStorage.getItem(INSTRUMENT_KEY))
    if (isSize(raw)) saved = raw
  } catch {
    /* storage unavailable — use the default */
  }
  activeInstrument = saved
  applyLayout(LAYOUTS[saved])
  return saved
}

// Initialise the derived maps at module load so importers (and tests) see a fully
// populated instrument without waiting for a startup call. Avoids touching
// localStorage here so it is safe under Node's test runner.
applyLayout(LAYOUTS[activeInstrument])

// A positive numeric frequency, or null if the value isn't usable.
export function validFreq(value: unknown): number | null {
  const f = Number(value)
  return Number.isFinite(f) && f > 0 ? f : null
}

// Bulk-apply frequencies from an N-row array of { push: { freq }, pull: { freq } },
// where N is the active instrument's button count. Names are left untouched — they
// describe the instrument's fixed layout.
export function setNoteFrequencies(rows: unknown): void {
  if (!Array.isArray(rows)) return
  LANE_NOTES.forEach((note, i) => {
    for (const type of DIRECTIONS) {
      const f = rows[i]?.[type] ? validFreq(rows[i][type].freq) : null
      if (f) note[type].freq = f
    }
  })
  rebuildCandidates()
}

// A deep copy of the active instrument's built-in note map — the starting point
// for a new preset and the target of the editor's "Reset".
export function getDefaultNotes(): LaneNote[] {
  return LAYOUTS[activeInstrument].buttons.map((b) => ({
    push: { ...b.push },
    pull: { ...b.pull },
  }))
}
