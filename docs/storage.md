# Presets & the song library (localStorage)

Note tunings and songs are both user-editable and persisted in `localStorage`.
They follow the same pattern: a built-in default that can't be edited or deleted,
plus user entries, surfaced through a "picker/library" modal that opens a full
"editor" modal. All modals are portaled to `document.body` and stack as overlays.

## Note-frequency presets — `data/presets.ts`

Keys `accordion-note-presets`, `accordion-active-preset`. API: `getPresets`,
`getActivePreset`, `setActivePreset`, `savePreset`, `deletePreset`,
`importPresetJSON`, `applyActivePreset`.

The active preset's frequencies are written into the live `LANE_NOTES` (the note
model in `data/instrument.ts`) by `applyActivePreset()` at startup (`main.tsx`)
and by `setActivePreset` on change. Managed from Settings → "Select preset"
(`PresetPicker` → `NoteFreq`).

## Song library — `data/songLibrary.ts` (over the model in `data/songs.ts`)

Key `accordion-user-songs`. API: `getSongs` (built-ins first, then user songs),
`saveSong`, `deleteSong`, `importSongJSON`, `normalizeSongDef`. Songs are stored
as raw defs and built on demand with `buildSong` (from `songs.ts`); the built
song keeps its raw `chart`/`color`/`difficulty` plus a `builtin` flag so it
round-trips through the editor. Managed from the Song accordion → "Add / edit
songs" (`SongLibrary` → `SongEditor`).

## Notes

- Difficulties are `Easy | Medium | Hard` (`DIFFICULTIES` in `data/songs.ts`).
- Uploads use a file picker (`UploadButton`) inside the modals — no drag-and-drop.
- `Start` tracks the selected song by **id** so selection survives adds/removes.
