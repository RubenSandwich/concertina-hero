// Note-frequency presets, persisted in localStorage — **scoped per instrument
// size**, since each anglo (7 / 10 / 20 / 30) has its own button count and tuning.
//
// A preset is { id, name, notes } where `notes` is a full N-row map for the active
// instrument. The built-in "Default" preset always exists and can't be edited or
// deleted; user presets live in localStorage under a size-specific key, so they
// never leak across instruments. Activating a preset pushes its frequencies into
// the live LANE_NOTES map (see instrument.ts) so the synth and mic detector pick
// them up at once.

import {
  DIRECTIONS,
  getActiveInstrument,
  getDefaultNotes,
  setNoteFrequencies,
  validFreq,
  type Direction,
  type InstrumentSize,
  type LaneNote,
  type NoteInfo,
} from './instrument.ts'
import { INSTRUMENT_SIZES } from './layout.ts'
import {
  findVersionMismatches,
  type VersionMismatch,
} from '../utils/storageVersion.ts'

// This store's own schema version (independent of songLibrary.ts's) — bump
// only when a *preset's* stored shape changes in a way an old record can't
// just fall back to sane defaults for.
const PRESET_SCHEMA_VERSION = '1'

// A saved note-frequency tuning. The built-in "Default" preset is `builtin`.
// `version` is this store's schema version (see PRESET_SCHEMA_VERSION above),
// stamped whenever a preset is created/saved.
export interface Preset {
  id: string
  name: string
  builtin?: boolean
  notes: LaneNote[]
  version: string
}

// Storage keys are per instrument size, so a 20-button's presets are separate from
// a 7-button's. (Old, size-agnostic presets under the previous keys are ignored —
// no migration, as decided.)
const presetsKeyFor = (size: InstrumentSize) => `concertina-presets-${size}`
const presetsKey = () => presetsKeyFor(getActiveInstrument())
const activePresetKey = () =>
  `concertina-active-preset-${getActiveInstrument()}`
export const DEFAULT_PRESET_ID = 'default'

// A short, collision-resistant id for a new user preset.
function makePresetId(): string {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// A fresh copy of the built-in default preset.
function makeDefaultPreset(): Preset {
  return {
    id: DEFAULT_PRESET_ID,
    name: 'Default',
    builtin: true,
    notes: getDefaultNotes(),
    version: PRESET_SCHEMA_VERSION,
  }
}

// Coerce arbitrary rows into a full, valid N-row map for the active instrument.
// Missing or bad values fall back to the defaults so every preset is playable.
function normalizeNotes(rows: unknown): LaneNote[] {
  return getDefaultNotes().map((def, i) => {
    const row = Array.isArray(rows) ? rows[i] : null
    const pick = (type: Direction): NoteInfo => {
      const src = (row && row[type]) || {}
      const f = validFreq(src.freq)
      return {
        name:
          typeof src.name === 'string' && src.name ? src.name : def[type].name,
        freq: f || def[type].freq,
      }
    }
    return { push: pick('push'), pull: pick('pull') }
  })
}

// User presets from localStorage (the built-in default is not stored here).
function readUserPresets(): Preset[] {
  try {
    const arr = JSON.parse(localStorage.getItem(presetsKey()) || '[]')
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        id: typeof p.id === 'string' && p.id ? p.id : makePresetId(),
        name:
          typeof p.name === 'string' && p.name.trim()
            ? p.name.trim()
            : 'Untitled preset',
        notes: normalizeNotes(p.notes),
        version:
          typeof p.version === 'string' && p.version
            ? p.version
            : PRESET_SCHEMA_VERSION,
      }))
  } catch {
    return []
  }
}

// Stored user presets (across every instrument size) whose `version` doesn't
// match PRESET_SCHEMA_VERSION — surfaced by the startup VersionMismatch modal.
export function findPresetVersionMismatches(): VersionMismatch[] {
  return INSTRUMENT_SIZES.flatMap((size) =>
    findVersionMismatches(
      presetsKeyFor(size),
      'preset',
      PRESET_SCHEMA_VERSION,
      (raw) => {
        const name =
          raw &&
          typeof raw === 'object' &&
          typeof (raw as Record<string, unknown>).name === 'string'
            ? ((raw as Record<string, unknown>).name as string)
            : 'Untitled preset'
        return `${name} (${size}-button)`
      },
    ),
  )
}

function writeUserPresets(presets: Preset[]): void {
  try {
    localStorage.setItem(presetsKey(), JSON.stringify(presets))
  } catch {
    /* storage unavailable — ignore */
  }
}

// Every preset, built-in default first.
export function getPresets(): Preset[] {
  return [makeDefaultPreset(), ...readUserPresets()]
}

// Look up a single preset by id (null if it doesn't exist).
export function getPreset(id: string): Preset | null {
  return getPresets().find((p) => p.id === id) || null
}

// The id of the preset currently in effect.
export function getActivePresetId(): string {
  try {
    return localStorage.getItem(activePresetKey()) || DEFAULT_PRESET_ID
  } catch {
    return DEFAULT_PRESET_ID
  }
}

// The preset currently in effect (falls back to the default).
export function getActivePreset(): Preset {
  return getPreset(getActivePresetId()) || makeDefaultPreset()
}

// Make a preset active and push its frequencies into the live note map.
export function setActivePreset(id: string): Preset {
  const preset = getPreset(id) || makeDefaultPreset()
  try {
    localStorage.setItem(activePresetKey(), preset.id)
  } catch {
    /* ignore */
  }
  setNoteFrequencies(preset.notes)
  return preset
}

// Create or update a user preset. Returns the stored preset (with its id).
export function savePreset({
  id,
  name,
  notes,
}: {
  id?: string
  name?: string
  notes?: unknown
}): Preset {
  const preset: Preset = {
    id: id && id !== DEFAULT_PRESET_ID ? id : makePresetId(),
    name: (name || '').trim() || 'Untitled preset',
    notes: normalizeNotes(notes),
    version: PRESET_SCHEMA_VERSION,
  }
  const presets = readUserPresets()
  const i = presets.findIndex((p) => p.id === preset.id)
  if (i >= 0) presets[i] = preset
  else presets.push(preset)
  writeUserPresets(presets)
  return preset
}

// Delete a user preset (the built-in default can't be removed). If it was the
// active preset, fall back to the default.
export function deletePreset(id: string): void {
  if (id === DEFAULT_PRESET_ID) return
  writeUserPresets(readUserPresets().filter((p) => p.id !== id))
  if (getActivePresetId() === id) setActivePreset(DEFAULT_PRESET_ID)
}

// Validate an uploaded preset JSON and store it as a new preset. Throws a
// friendly Error if the file isn't usable.
export function importPresetJSON(data: unknown): Preset {
  const obj =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  const rows = Array.isArray(data) ? data : obj?.notes
  if (!Array.isArray(rows))
    throw new Error('Expected a JSON preset with a "notes" array.')
  const hasValid = rows.some(
    (row) => row && DIRECTIONS.some((t) => row[t] && validFreq(row[t].freq)),
  )
  if (!hasValid) throw new Error('No valid note frequencies found in the file.')
  const name =
    obj && typeof obj.name === 'string' && obj.name.trim()
      ? obj.name.trim()
      : 'Uploaded preset'
  return savePreset({ name, notes: rows })
}

// Apply whichever preset was active last time. Called once at startup (main.tsx)
// so the live LANE_NOTES map reflects the saved tuning before anything plays.
export function applyActivePreset(): Preset {
  return setActivePreset(getActivePresetId())
}
