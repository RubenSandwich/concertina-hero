// The song library: built-in songs plus user songs persisted in localStorage.
//
// A song is stored as a raw definition { id, name, blurb, bpm, subdivision,
// color, difficulty, chart } and built on demand with buildSong (see songs.ts).
// Built-in songs come from BUILTIN_DEFS and can't be edited or deleted; user
// songs live in localStorage.

import {
  buildSong,
  chartNoteCount,
  DIFFICULTIES,
  type Difficulty,
  type Song,
  type SongDef,
} from './songs'
import { randomAccentColor } from './colors'

const HEX_RE = /^#[0-9a-f]{3,8}$/i
const SONGS_KEY = 'accordion-user-songs'

function makeSongId(): string {
  return 'song-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function isBuiltinId(id: string): boolean {
  return BUILTIN_DEFS.some((d) => d.id === id)
}

// Validate + normalize a raw song definition (from the editor or an upload) into
// the fields buildSong needs. Throws a friendly Error when something's missing.
export function normalizeSongDef(data: unknown, { id }: { id?: string } = {}): SongDef {
  if (!data || typeof data !== 'object') throw new Error('The file must contain a song object.')
  const d = data as Record<string, unknown>
  const name = typeof d.name === 'string' ? d.name.trim() : ''
  if (!name) throw new Error('Song needs a name.')
  const bpm = Number(d.bpm)
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Song needs a positive BPM.')
  const chart = typeof d.chart === 'string' ? d.chart : ''
  if (!chart.trim()) throw new Error('Song needs a chart (tokens like +3 or -4).')
  if (!chartNoteCount(chart)) {
    throw new Error('The chart has no playable notes (use tokens like +3 or -4).')
  }
  const sub = Number(d.subdivision)
  const subdivision = Number.isFinite(sub) && sub > 0 ? sub : 1
  const color =
    typeof d.color === 'string' && HEX_RE.test(d.color.trim())
      ? d.color.trim()
      : randomAccentColor()
  const difficulty: Difficulty = DIFFICULTIES.includes(d.difficulty as Difficulty)
    ? (d.difficulty as Difficulty)
    : 'Medium'
  const blurb =
    typeof d.blurb === 'string' && d.blurb.trim() ? d.blurb.trim().slice(0, 120) : 'A custom song.'
  return {
    id: id || makeSongId(),
    name: name.slice(0, 60),
    blurb,
    bpm,
    subdivision,
    color,
    difficulty,
    chart,
  }
}

// User song definitions from localStorage.
function readUserDefs(): unknown[] {
  try {
    const arr = JSON.parse(localStorage.getItem(SONGS_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeUserDefs(defs: SongDef[]): void {
  try {
    localStorage.setItem(SONGS_KEY, JSON.stringify(defs))
  } catch {
    /* storage unavailable — ignore */
  }
}

// Every playable song: the built-in ones first, then user songs from storage.
// Built songs carry their raw fields (chart, color, difficulty, builtin flag) so
// the library and editor can round-trip them.
export function getSongs(): Song[] {
  const builtin = BUILTIN_DEFS.map((d) => buildSong({ ...d, builtin: true }))
  const user: Song[] = []
  for (const raw of readUserDefs()) {
    try {
      const rawId = (raw as { id?: unknown })?.id
      const def = normalizeSongDef(raw, { id: typeof rawId === 'string' ? rawId : undefined })
      user.push(buildSong({ ...def, builtin: false }))
    } catch {
      /* skip an unusable stored song */
    }
  }
  return [...builtin, ...user]
}

// Create or update a user song from a raw definition. Returns the built song.
export function saveSong(data: unknown): Song {
  const dataId = (data as { id?: unknown })?.id
  const keepId = typeof dataId === 'string' && dataId && !isBuiltinId(dataId) ? dataId : undefined
  const def = normalizeSongDef(data, { id: keepId })
  const song = buildSong({ ...def, builtin: false })
  const defs = readUserDefs().filter((d): d is SongDef => !!d && typeof d === 'object')
  const i = defs.findIndex((d) => d.id === def.id)
  if (i >= 0) defs[i] = def
  else defs.push(def)
  writeUserDefs(defs)
  return song
}

// Delete a user song (built-ins can't be removed).
export function deleteSong(id: string): void {
  if (isBuiltinId(id)) return
  const defs = readUserDefs().filter(
    (d): d is SongDef => !!d && typeof d === 'object' && (d as SongDef).id !== id,
  )
  writeUserDefs(defs)
}

// Validate + store an uploaded song JSON as a new user song. Returns the song.
export function importSongJSON(data: unknown): Song {
  return saveSong({ ...(data as Record<string, unknown>), id: undefined })
}

// Raw definitions for the built-in songs (source of truth; built on demand).
type BuiltinDef = Omit<SongDef, 'subdivision'>

const BUILTIN_DEFS: BuiltinDef[] = [
  {
    id: 'twinkle',
    name: 'Twinkle, Twinkle',
    blurb: 'The classic. Mostly gentle push/pull pairs.',
    bpm: 100,
    color: '#8ac926',
    difficulty: 'Easy',
    chart: `
      +1 +1 +3 +3 -3 -3 +3
      -2 -2 +2 +2 -1 -1 +1
      +3 +3 -2 -2 +2 +2 -1
      +3 +3 -2 -2 +2 +2 -1
      +1 +1 +3 +3 -3 -3 +3
      -2 -2 +2 +2 -1 -1 +1
    `,
  },
  {
    id: 'row-your-boat',
    name: 'Row, Row, Row Your Boat',
    blurb: 'Reaches the high buttons with quick direction flips.',
    bpm: 112,
    color: '#4cc9f0',
    difficulty: 'Medium',
    chart: `
      +3 +3 +3 -3 -4
      -4 -3 -4 +4 -5
      +6 +6 +6
      -5 -5 -5
      -4 -4 -4
      +3 -5 +4 -4 -3 +3
    `,
  },
  {
    id: 'ode-to-joy',
    name: 'Ode to Joy',
    blurb: 'Beethoven at a brisk pace — mind the push/pull switches.',
    bpm: 124,
    color: '#ff5d5d',
    difficulty: 'Hard',
    chart: `
      +2 +2 -2 +3 +3 -2 +2 -1
      +1 +1 -1 +2 +2 -1 -1
      +2 +2 -2 +3 +3 -2 +2 -1
      +1 +1 -1 +2 -1 +1 +1
    `,
  },
  {
    id: 'chord-parade',
    name: 'Chord Parade',
    blurb: 'Squeeze a few buttons at once, then breathe — full of chords and rests.',
    bpm: 108,
    color: '#9d4edd',
    difficulty: 'Medium',
    chart: `
      +1 X +1 (+1 +3)
      -2 X (-2 -3) X
      +3 +3 (+3 +5) X
      (-4 -3) X +2 X
      +1 (+1 +3) +1 X
      (+1 +3 +5) X (+1 +3 +5) X
    `,
  },
]
