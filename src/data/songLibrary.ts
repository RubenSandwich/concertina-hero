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
import twinkle from './builtinSongs/twinkle.json'
import rowYourBoat from './builtinSongs/row-your-boat.json'
import odeToJoy from './builtinSongs/ode-to-joy.json'
import chordParade from './builtinSongs/chord-parade.json'
import songOfStorms from './builtinSongs/song-of-storms.json'
import concerningHobbits from './builtinSongs/concerning-hobbits.json'
import drunkenSailor from './builtinSongs/drunken-sailor.json'
import taps from './builtinSongs/taps.json'

const HEX_RE = /^#[0-9a-f]{3,8}$/i
const SONGS_KEY = 'accordion-user-songs'

function makeSongId(): string {
  return (
    'song-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  )
}

function isBuiltinId(id: string): boolean {
  return BUILTIN_DEFS.some((d) => d.id === id)
}

// Validate + normalize a raw song definition (from the editor or an upload) into
// the fields buildSong needs. Throws a friendly Error when something's missing.
export function normalizeSongDef(
  data: unknown,
  { id }: { id?: string } = {},
): SongDef {
  if (!data || typeof data !== 'object')
    throw new Error('The file must contain a song object.')
  const d = data as Record<string, unknown>
  const name = typeof d.name === 'string' ? d.name.trim() : ''
  if (!name) throw new Error('Song needs a name.')
  const bpm = Number(d.bpm)
  if (!Number.isFinite(bpm) || bpm <= 0)
    throw new Error('Song needs a positive BPM.')
  // chart is an array of lines (see SongDef); accept a plain string too, for a
  // hand-written upload that didn't split it up.
  const chart = Array.isArray(d.chart)
    ? d.chart.filter((line): line is string => typeof line === 'string')
    : typeof d.chart === 'string'
      ? [d.chart]
      : []
  if (!chart.some((line) => line.trim())) {
    throw new Error('Song needs a chart (tokens like +3 or -4).')
  }
  if (!chartNoteCount(chart.join('\n'))) {
    throw new Error(
      'The chart has no playable notes (use tokens like +3 or -4).',
    )
  }
  const sub = Number(d.subdivision)
  const subdivision = Number.isFinite(sub) && sub > 0 ? sub : 1
  const color =
    typeof d.color === 'string' && HEX_RE.test(d.color.trim())
      ? d.color.trim()
      : randomAccentColor()
  const difficulty: Difficulty = DIFFICULTIES.includes(
    d.difficulty as Difficulty,
  )
    ? (d.difficulty as Difficulty)
    : 'Medium'
  const blurb =
    typeof d.blurb === 'string' && d.blurb.trim()
      ? d.blurb.trim().slice(0, 120)
      : 'A custom song.'
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
      const def = normalizeSongDef(raw, {
        id: typeof rawId === 'string' ? rawId : undefined,
      })
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
  const keepId =
    typeof dataId === 'string' && dataId && !isBuiltinId(dataId)
      ? dataId
      : undefined
  const def = normalizeSongDef(data, { id: keepId })
  const song = buildSong({ ...def, builtin: false })
  const defs = readUserDefs().filter(
    (d): d is SongDef => !!d && typeof d === 'object',
  )
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
    (d): d is SongDef =>
      !!d && typeof d === 'object' && (d as SongDef).id !== id,
  )
  writeUserDefs(defs)
}

// Validate + store an uploaded song JSON as a new user song. Returns the song.
export function importSongJSON(data: unknown): Song {
  return saveSong({ ...(data as Record<string, unknown>), id: undefined })
}

// A JSON import infers `difficulty` as the widened `string` type, not the
// literal `Difficulty` union it actually holds — this narrows it back.
// Unlike normalizeSongDef() (which validates an *untrusted* upload and
// quietly falls back when something's wrong), a bad value here is a bug in
// a file we authored ourselves, so it throws instead of papering over it.
function asDifficulty(value: string): Difficulty {
  if (!DIFFICULTIES.includes(value as Difficulty)) {
    throw new Error(`Unknown difficulty "${value}" in a built-in song.`)
  }
  return value as Difficulty
}

// Raw definitions for the built-in songs (source of truth; built on demand).
// Each lives in its own JSON file under ./builtinSongs; this array's order is
// the song list's display order.
type BuiltinDef = Omit<SongDef, 'subdivision'>

const BUILTIN_DEFS: BuiltinDef[] = [
  twinkle,
  rowYourBoat,
  odeToJoy,
  chordParade,
  songOfStorms,
  concerningHobbits,
  drunkenSailor,
  taps,
].map((d) => ({ ...d, difficulty: asDifficulty(d.difficulty) }))
