// The song model: the chart notation, the parser that turns a chart string into
// timed notes + push/pull sections, and the built song shape. Persistence of
// user songs lives in songLibrary.ts.

import { LEAD_IN } from './timing.ts'
import type { Direction } from './instrument'
import { MAX_BUTTONS } from './layout.ts'

// A single playable note parsed from a chart.
export interface Note {
  id: number
  lane: number
  time: number
  type: Direction
}

// A run of consecutive same-direction notes (drives the look-ahead ribbon).
export interface Section {
  id: number
  dir: Direction
  start: number
  end: number
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard'

// A raw, validated song definition — the form persisted in localStorage and fed
// to buildSong. `chart` is an array of lines rather than one long string — a
// JSON string can't contain a literal newline, so this lets a chart be
// written/read one phrase per line; line breaks are just for readability and
// are joined back into one string before parsing (see buildSong).
//
// `version` is the storage model version (see data/storageVersion.ts),
// stamped by songLibrary.ts whenever a user song is saved. It's optional here
// (rather than on Song) because built-in songs are source-controlled JSON,
// never migrated, and so never carry one.
export interface SongDef {
  id: string
  name: string
  blurb: string
  bpm: number
  subdivision: number
  color: string
  difficulty: Difficulty
  chart: string[]
  version?: string
}

// A built, playable song: its definition plus the derived notes/sections/timing.
export interface Song extends SongDef {
  builtin: boolean
  notes: Note[]
  sections: Section[]
  duration: number
  // The highest button number the chart uses = the smallest instrument that can
  // play it. The song list disables songs that need more buttons than you have.
  requiredButtons: number
}

export const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

// Maps a difficulty to its badge CSS class (shared by every song UI).
export const DIFF_CLASS: Record<Difficulty, string> = {
  Easy: 'diff--easy',
  Medium: 'diff--med',
  Hard: 'diff--hard',
}

// Chart format: a whitespace / line separated list of tokens like "+3" or "-4".
//   - the number (1–30) is the concertina button to press. Charts are
//     instrument-agnostic — a song's highest button is the smallest instrument it
//     needs (see `requiredButtons`), and the song list gates on that.
//   - "+" means PUSH (squeeze the bellows in); "-" means PULL (draw them out).
//     A bare number (e.g. "3") defaults to push.
//   - "X" (or "x") is a REST: a silent beat where nothing is played.
//   - a CHORD is several buttons in parentheses that sound on the same beat,
//     e.g. "(-4 -3)" plays buttons 4 and 3 together (draw). One beat is used.
//   - every token is one beat. Whitespace and line breaks only separate tokens;
//     to pause between phrases, end the phrase with an "X" rest.
//
// Example ("Row, Row, Row Your Boat"):  +3 +3 +3 -3 -4 X  ...

// A signed button number 1–30 (single digit, 10–29, or exactly 30). Anything
// outside that range — 0, 31, letters — is not a note.
const NOTE_RE = /^([+-]?)([1-9]|[12]\d|30)$/
// A token is either a "(...)" chord group or a run of non-space characters.
const TOKEN_RE = /\([^)]*\)|\S+/g

interface ParseOptions {
  bpm: number
  subdivision?: number
}

function parseChart(
  chart: string,
  { bpm, subdivision = 1 }: ParseOptions,
): { notes: Note[]; duration: number; requiredButtons: number } {
  const step = 60000 / bpm / subdivision // ms between beats
  const notes: Note[] = []
  let noteId = 0
  let cursor = 0
  let requiredButtons = 0 // the highest button number the chart references

  const addNote = (tok: string, time: number) => {
    const m = NOTE_RE.exec(tok)
    if (!m) return
    const type: Direction = m[1] === '-' ? 'pull' : 'push'
    const button = Number(m[2])
    requiredButtons = Math.max(requiredButtons, button)
    notes.push({ id: noteId++, lane: button - 1, time, type })
  }

  const tokens = chart.match(TOKEN_RE) || []
  tokens.forEach((tok) => {
    if (tok === 'X' || tok === 'x') {
      cursor += 1 // rest: a silent beat
      return
    }
    const time = Math.round(cursor * step)
    if (tok[0] === '(') {
      // Chord: every button inside sounds on this beat.
      const inner = tok.slice(1, -1).trim().split(/\s+/).filter(Boolean)
      inner.forEach((t) => addNote(t, time))
      cursor += 1
      return
    }
    const before = notes.length
    addNote(tok, time)
    if (notes.length > before) cursor += 1 // only a valid note uses a beat
  })

  return { notes, duration: Math.round(cursor * step), requiredButtons }
}

// Group consecutive same-direction notes into push/pull runs. These drive the
// look-ahead ribbon and the current-direction banner.
function deriveSections(notes: Note[], duration: number): Section[] {
  const runs: { dir: Direction; start: number }[] = []
  notes.forEach((n) => {
    const last = runs[runs.length - 1]
    if (!last || last.dir !== n.type) runs.push({ dir: n.type, start: n.time })
  })
  return runs.map((r, i) => ({
    id: i,
    dir: r.dir,
    start: r.start,
    end: i < runs.length - 1 ? runs[i + 1].start : duration,
  }))
}

// buildSong accepts a definition whose `subdivision`/`builtin` may be omitted.
type BuildInput = Omit<SongDef, 'subdivision'> & {
  subdivision?: number
  builtin?: boolean
}

// Build a raw definition into a playable song: parse its chart into notes and
// push/pull sections, keeping the raw fields so it round-trips through the editor.
export function buildSong({
  id,
  name,
  blurb,
  bpm,
  subdivision = 1,
  color,
  difficulty,
  chart,
  builtin = false,
}: BuildInput): Song {
  const { notes, duration, requiredButtons } = parseChart(chart.join('\n'), {
    bpm,
    subdivision,
  })
  const sections = deriveSections(notes, duration)
  return {
    id,
    name,
    blurb,
    bpm,
    subdivision,
    color,
    difficulty,
    chart,
    builtin,
    notes,
    sections,
    duration,
    requiredButtons,
  }
}

// Count the playable notes in a chart string (editor feedback + validation).
export function chartNoteCount(chart: string): number {
  return parseChart(String(chart || ''), { bpm: 120 }).notes.length
}

// The highest button number a chart references = the smallest instrument that can
// play it (0 for an empty chart). Editor feedback + song-list gating.
export function chartRequiredButtons(chart: string): number {
  return parseChart(String(chart || ''), { bpm: 120 }).requiredButtons
}

// Button numbers a chart uses that fall outside the playable range (1–30). The
// parser silently drops these, so the editor surfaces them instead of letting a
// typo like "+31" vanish. Returns the offending numbers, sorted, with no repeats.
export function chartOutOfRange(chart: string): number[] {
  const bad = new Set<number>()
  for (const tok of String(chart || '').match(TOKEN_RE) || []) {
    const inner = tok[0] === '(' ? tok.slice(1, -1).split(/\s+/) : [tok]
    for (const t of inner) {
      const m = /^[+-]?(\d+)$/.exec(t)
      if (m) {
        const n = Number(m[1])
        if (n < 1 || n > MAX_BUTTONS) bad.add(n)
      }
    }
  }
  return [...bad].sort((a, b) => a - b)
}

// Shift a song so the first note only appears *after* the countdown ends: every
// note and section starts LEAD_IN ms in, so the playfield stays empty during the
// 3-2-1.
export function withLeadIn(song: Song): Song {
  return {
    ...song,
    notes: song.notes.map((n) => ({ ...n, time: n.time + LEAD_IN })),
    sections: song.sections.map((s) => ({
      ...s,
      start: s.start + LEAD_IN,
      end: s.end + LEAD_IN,
    })),
    duration: song.duration + LEAD_IN,
  }
}
