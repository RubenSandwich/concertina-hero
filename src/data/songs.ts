// The song model: the chart notation, the parser that turns a chart string into
// timed notes + push/pull sections, and the built song shape. Persistence of
// user songs lives in songLibrary.ts.

import { LEAD_IN } from './timing'
import type { Direction } from './instrument'

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
// to buildSong.
export interface SongDef {
  id: string
  name: string
  blurb: string
  bpm: number
  subdivision: number
  color: string
  difficulty: Difficulty
  chart: string
}

// A built, playable song: its definition plus the derived notes/sections/timing.
export interface Song extends SongDef {
  builtin: boolean
  notes: Note[]
  sections: Section[]
  duration: number
}

export const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

// Maps a difficulty to its badge CSS class (shared by every song UI).
export const DIFF_CLASS: Record<Difficulty, string> = {
  Easy: 'diff--easy',
  Medium: 'diff--med',
  Hard: 'diff--hard',
}

// Chart format: a whitespace / line separated list of tokens like "+3" or "-4".
//   - the number (1-7) is the concertina button to press.
//   - "+" means PUSH (squeeze the bellows in); "-" means PULL (draw them out).
//     A bare number (e.g. "3") defaults to push.
//   - "X" (or "x") is a REST: a silent beat where nothing is played.
//   - a CHORD is several buttons in parentheses that sound on the same beat,
//     e.g. "(-4 -3)" plays buttons 4 and 3 together (draw). One beat is used.
//   - every token is one beat. Whitespace and line breaks only separate tokens;
//     to pause between phrases, end the phrase with an "X" rest.
//
// Example ("Row, Row, Row Your Boat"):  +3 +3 +3 -3 -4 X  ...

const NOTE_RE = /^([+-]?)([1-7])$/
// A token is either a "(...)" chord group or a run of non-space characters.
const TOKEN_RE = /\([^)]*\)|\S+/g

interface ParseOptions {
  bpm: number
  subdivision?: number
}

function parseChart(
  chart: string,
  { bpm, subdivision = 1 }: ParseOptions,
): { notes: Note[]; duration: number } {
  const step = 60000 / bpm / subdivision // ms between beats
  const notes: Note[] = []
  let noteId = 0
  let cursor = 0

  const addNote = (tok: string, time: number) => {
    const m = NOTE_RE.exec(tok)
    if (!m) return
    const type: Direction = m[1] === '-' ? 'pull' : 'push'
    const lane = Number(m[2]) - 1
    notes.push({ id: noteId++, lane, time, type })
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

  return { notes, duration: Math.round(cursor * step) }
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
type BuildInput = Omit<SongDef, 'subdivision'> & { subdivision?: number; builtin?: boolean }

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
  const { notes, duration } = parseChart(chart, { bpm, subdivision })
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
  }
}

// Count the playable notes in a chart string (editor feedback + validation).
export function chartNoteCount(chart: string): number {
  return parseChart(String(chart || ''), { bpm: 120 }).notes.length
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
