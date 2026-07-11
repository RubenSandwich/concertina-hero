// Instrument layouts: how an anglo of each size (7 / 10 / 20 / 30 buttons) is
// arranged on screen and what each button sounds. This is the pure data layer the
// rest of the app reads through `instrument.ts`. Everything keys on the flat
// `lane` index (0…N-1), which equals the display number − 1.
//
// The number is assigned top-to-bottom, left-to-right across the screen — so the
// same integer ties together the chart, the key map, the geometry and the notes.

import type { LaneNote, NoteInfo } from './instrument'

// The anglo sizes the game understands. The size a player selects drives geometry,
// colours, key labels and tuning.
export type InstrumentSize = 7 | 10 | 20 | 30
export const INSTRUMENT_SIZES: InstrumentSize[] = [7, 10, 20, 30]
export const DEFAULT_INSTRUMENT: InstrumentSize = 7

// The largest button number any chart can reference — the biggest instrument.
export const MAX_BUTTONS = 30

// The smallest instrument that has at least `buttons` buttons — i.e. the minimum
// size a song using that many buttons needs. Falls back to the largest size.
export function minInstrumentFor(buttons: number): InstrumentSize {
  return (
    INSTRUMENT_SIZES.find((size) => size >= buttons) ??
    INSTRUMENT_SIZES[INSTRUMENT_SIZES.length - 1]
  )
}

// How one anglo's buttons are arranged. A "hand" is half the keyboard; when split
// the right hand mirrors the left across the bellows divider. Rows stack
// vertically, and a staggered layout offsets alternate rows by half a column.
export interface HandGeom {
  hands: number // 1 (a centred single row) or 2 (left + right hands)
  cols: number // buttons per hand, per row
  rows: number // rows per hand
  split: boolean // two hands with a divider (false = one centred row)
  mirror: boolean // the right hand is the mirror image of the left
  stagger: boolean // offset alternate rows by half a column
}

// One button: its identity, where it sits, how it is played, and what it sounds.
export interface ButtonSpec {
  lane: number // 0…N-1, === number − 1
  number: number // 1…N — shown in mic mode, and the index into the key map
  hand: 'left' | 'right' | 'center'
  row: number // 0 = top row
  col: number // 0…cols-1, counted from the hand's OUTER edge (drives colour + mirror)
  x: number // 0…1, the lane's horizontal centre across the playfield
  key: string // physical key (event.code), e.g. 'KeyQ'
  keyLabel: string // what that key prints, e.g. 'Q'
  color: string // paper-craft fill for the button and its falling notes
  push: NoteInfo
  pull: NoteInfo
}

export interface InstrumentLayout {
  size: InstrumentSize
  geom: HandGeom
  buttons: ButtonSpec[]
}

// The fixed physical key grid (Decision 4). Buttons are numbered in exactly this
// order, so one map serves every size: the 7-button uses the first seven, the
// 10-button the top row, and so on. `event.code` keeps it layout-independent.
//
//   top     Q W E R T | Y U I O P   → buttons  1  2  3  4  5 |  6  7  8  9 10
//   home    A S D F G | H J K L ;   → buttons 11 12 13 14 15 | 16 17 18 19 20
//   bottom  Z X C V B | N M , . /   → buttons 21 22 23 24 25 | 26 27 28 29 30
export const KEY_ORDER = [
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyT',
  'KeyY',
  'KeyU',
  'KeyI',
  'KeyO',
  'KeyP',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyJ',
  'KeyK',
  'KeyL',
  'Semicolon',
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyV',
  'KeyB',
  'KeyN',
  'KeyM',
  'Comma',
  'Period',
  'Slash',
] as const

export const KEY_LABELS = [
  'Q',
  'W',
  'E',
  'R',
  'T',
  'Y',
  'U',
  'I',
  'O',
  'P',
  'A',
  'S',
  'D',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  ';',
  'Z',
  'X',
  'C',
  'V',
  'B',
  'N',
  'M',
  ',',
  '.',
  '/',
] as const

// The 7-button toy concertina keeps its bright rainbow (one hue per button).
const RAINBOW_7 = ['#ff5d5d', '#ff924c', '#ffd23f', '#8ac926', '#2ec4b6', '#4cc9f0', '#b892ff']

// Bigger anglos colour by column, counted from the outer edge inward, so the
// right hand mirrors the left across the divider (button 1 and button N share the
// outer hue; the two buttons flanking the divider share the inner hue).
const COLUMN_PALETTE = ['#ff5d5d', '#ff924c', '#ffd23f', '#2ec4b6', '#ff8fce']

// A note letter (+ accidental) and its equal-tempered frequency (A4 = 440Hz),
// parsed from a spec like "C4", "F#5" or "Bb3". The displayed name drops the
// octave — the game shows "C", not "C4".
const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
function note(spec: string): NoteInfo {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(spec)
  if (!m) throw new Error(`bad note spec: ${spec}`)
  const [, letter, accidental, octaveStr] = m
  let semis = SEMITONES[letter]
  if (accidental === '#') semis += 1
  else if (accidental === 'b') semis -= 1
  const midi = (Number(octaveStr) + 1) * 12 + semis
  const freq = 440 * Math.pow(2, (midi - 69) / 12)
  return { name: letter + accidental, freq: Math.round(freq * 100) / 100 }
}

// Build a button's push/pull pair from two note specs.
const pair = (push: string, pull: string): LaneNote => ({ push: note(push), pull: note(pull) })

// ---------------------------------------------------------------------------
// Per-size note maps, listed in button-number order (index === lane).
// ---------------------------------------------------------------------------

// The original toy: exact frequencies preserved so its tuning never shifts.
const NOTES_7: LaneNote[] = [
  { push: { name: 'C', freq: 261.63 }, pull: { name: 'D', freq: 293.66 } },
  { push: { name: 'E', freq: 329.63 }, pull: { name: 'F', freq: 349.23 } },
  { push: { name: 'G', freq: 392.0 }, pull: { name: 'A', freq: 440.0 } },
  { push: { name: 'C', freq: 523.25 }, pull: { name: 'B', freq: 493.88 } },
  { push: { name: 'E', freq: 659.25 }, pull: { name: 'D', freq: 587.33 } },
  { push: { name: 'G', freq: 783.99 }, pull: { name: 'F', freq: 698.46 } },
  { push: { name: 'B', freq: 987.77 }, pull: { name: 'A', freq: 880.0 } },
]

// 10-button: one diatonic row per hand (a C-major run each, right hand higher).
const NOTES_10: LaneNote[] = [
  pair('C4', 'D4'),
  pair('E4', 'F4'),
  pair('G4', 'A4'),
  pair('B4', 'C5'),
  pair('D5', 'E5'),
  pair('G4', 'A4'),
  pair('B4', 'C5'),
  pair('D5', 'E5'),
  pair('F5', 'G5'),
  pair('A5', 'B5'),
]

// 20-button: two rows per hand — a C row on top, a G row (with F#) below.
const NOTES_20: LaneNote[] = [
  // top — C row
  pair('C4', 'D4'),
  pair('E4', 'F4'),
  pair('G4', 'A4'),
  pair('B4', 'C5'),
  pair('D5', 'E5'),
  pair('G4', 'A4'),
  pair('B4', 'C5'),
  pair('D5', 'E5'),
  pair('F5', 'G5'),
  pair('A5', 'B5'),
  // bottom — G row
  pair('G3', 'A3'),
  pair('B3', 'C4'),
  pair('D4', 'E4'),
  pair('F#4', 'G4'),
  pair('A4', 'B4'),
  pair('D4', 'E4'),
  pair('F#4', 'G4'),
  pair('A4', 'B4'),
  pair('C5', 'D5'),
  pair('E5', 'F#5'),
]

// 30-button: an accidental row on top (as a real C/G anglo has), then the C row
// and the G row.
const NOTES_30: LaneNote[] = [
  // top — accidental row
  pair('C#4', 'D#4'),
  pair('D#4', 'F4'),
  pair('F#4', 'G#4'),
  pair('G#4', 'A#4'),
  pair('A#4', 'C5'),
  pair('C#5', 'D#5'),
  pair('D#5', 'F5'),
  pair('F#5', 'G#5'),
  pair('G#5', 'A#5'),
  pair('A#5', 'C6'),
  // middle — C row
  pair('C4', 'D4'),
  pair('E4', 'F4'),
  pair('G4', 'A4'),
  pair('B4', 'C5'),
  pair('D5', 'E5'),
  pair('G4', 'A4'),
  pair('B4', 'C5'),
  pair('D5', 'E5'),
  pair('F5', 'G5'),
  pair('A5', 'B5'),
  // bottom — G row
  pair('G3', 'A3'),
  pair('B3', 'C4'),
  pair('D4', 'E4'),
  pair('F#4', 'G4'),
  pair('A4', 'B4'),
  pair('D4', 'E4'),
  pair('F#4', 'G4'),
  pair('A4', 'B4'),
  pair('C5', 'D5'),
  pair('E5', 'F#5'),
]

// The horizontal lane centre of a button, 0 (left edge) … 1 (right edge). The
// left hand fills [0, handW]; the right hand is its mirror across the divider, so
// a staggered row that shifts right on the left shifts left on the right.
function laneX(
  geom: HandGeom,
  hand: 'left' | 'right' | 'center',
  col: number,
  row: number,
): number {
  const handW = geom.split ? 0.5 : 1
  const unit = handW / geom.cols
  const off = geom.stagger ? (row % 2 === 1 ? 0.75 : 0.25) : 0.5
  const local = unit * (col + off) // distance inward from the hand's outer edge
  return hand === 'right' ? 1 - local : local
}

// Turn a geometry + note map into the flat button list. Buttons are placed, then
// numbered by reading the screen top-to-bottom and left-to-right.
function buildButtons(geom: HandGeom, notes: LaneNote[], palette: string[]): ButtonSpec[] {
  interface Raw {
    hand: 'left' | 'right' | 'center'
    row: number
    col: number
    x: number
  }
  const raws: Raw[] = []
  for (let row = 0; row < geom.rows; row++) {
    for (let h = 0; h < geom.hands; h++) {
      const hand: 'left' | 'right' | 'center' = !geom.split ? 'center' : h === 0 ? 'left' : 'right'
      for (let col = 0; col < geom.cols; col++) {
        raws.push({ hand, row, col, x: laneX(geom, hand, col, row) })
      }
    }
  }
  raws.sort((a, b) => a.row - b.row || a.x - b.x)
  return raws.map((r, lane) => ({
    lane,
    number: lane + 1,
    hand: r.hand,
    row: r.row,
    col: r.col,
    x: r.x,
    key: KEY_ORDER[lane],
    keyLabel: KEY_LABELS[lane],
    color: palette[r.col] ?? palette[palette.length - 1],
    push: notes[lane].push,
    pull: notes[lane].pull,
  }))
}

function makeLayout(
  size: InstrumentSize,
  geom: HandGeom,
  notes: LaneNote[],
  palette: string[],
): InstrumentLayout {
  return { size, geom, buttons: buildButtons(geom, notes, palette) }
}

export const LAYOUTS: Record<InstrumentSize, InstrumentLayout> = {
  7: makeLayout(
    7,
    { hands: 1, cols: 7, rows: 1, split: false, mirror: false, stagger: false },
    NOTES_7,
    RAINBOW_7,
  ),
  10: makeLayout(
    10,
    { hands: 2, cols: 5, rows: 1, split: true, mirror: true, stagger: false },
    NOTES_10,
    COLUMN_PALETTE,
  ),
  20: makeLayout(
    20,
    { hands: 2, cols: 5, rows: 2, split: true, mirror: true, stagger: true },
    NOTES_20,
    COLUMN_PALETTE,
  ),
  30: makeLayout(
    30,
    { hands: 2, cols: 5, rows: 3, split: true, mirror: true, stagger: true },
    NOTES_30,
    COLUMN_PALETTE,
  ),
}
