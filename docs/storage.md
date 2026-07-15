# Presets & the song library (localStorage)

Note tunings and songs are both user-editable and persisted in `localStorage`.
They follow the same pattern: a built-in default that can't be edited or deleted,
plus user entries, surfaced through a "picker/library" modal that opens a full
"editor" modal. All modals are portaled to `document.body` and stack as overlays.

## Active instrument — `instrument/instrument.ts`

Key `concertina-instrument` (a size: `7` | `10` | `20` | `30`, default `7`). Applied
at startup by `applyActiveInstrument()` (`main.tsx`, **before** the preset) and
changed by `setActiveInstrument`, which rebuilds the live maps from `LAYOUTS[size]`
in `instrument/layout.ts`. Chosen from Settings → "Your concertina".

## Note-frequency presets — `instrument/presets.ts`

**Scoped per instrument size:** keys `concertina-presets-{N}` and
`concertina-active-preset-{N}` (N = 7/10/20/30), so a 20-button's tunings never mix
with a 7-button's. A preset's `notes` are a full N-row map. API: `getPresets`,
`getActivePreset`, `setActivePreset`, `savePreset`, `deletePreset`,
`importPresetJSON`, `applyActivePreset` — all operate on the active size. (The old
size-agnostic keys are ignored; no migration.)

The active preset's frequencies are written into the live `LANE_NOTES` (the note
model in `instrument/instrument.ts`) by `applyActivePreset()` at startup (`main.tsx`),
by `setActivePreset` on change, and by the instrument switch. Managed from
Settings → "Select preset" (`PresetPicker` → `NoteFreq`).

## Song library — `songs/songLibrary.ts` (over the model in `songs/songs.ts`)

Key `accordion-user-songs`. API: `getSongs` (built-ins first, then user songs),
`saveSong`, `deleteSong`, `importSongJSON`, `normalizeSongDef`. Songs are stored
as raw defs and built on demand with `buildSong` (from `songs.ts`); the built
song keeps its raw `chart`/`color`/`difficulty` plus a `builtin` flag so it
round-trips through the editor. Managed from the Song accordion → "Add / edit
songs" (`SongLibrary` → `SongEditor`).

## Notes

- Difficulties are `Easy | Medium | Hard` (`DIFFICULTIES` in `songs/songs.ts`).
- Uploads use a file picker (`UploadButton`) inside the modals — no drag-and-drop.
- `Start` tracks the selected song by **id** so selection survives adds/removes.
