# Architecture

Screen flow is `start → game → results`, routed in `App.tsx` with directional
View Transitions. Every UI piece lives in its own folder with the `*.css` it
imports.

```
src/
  main.tsx                entry (createRoot + StrictMode; applies the saved tuning)
  App.tsx                 screen router (start → game → results), View Transitions
  index.css               global theme + CSS vars + shared primitives (.paper/.btn/.title/.diff)

  instrument/layout.ts    per-size anglo layouts (7/10/20/30): HandGeom + ButtonSpec,
                          geometry/numbering/colours/key grid/default notes, LAYOUTS,
                          minInstrumentFor, MAX_BUTTONS
  instrument/instrument.ts the active instrument: Direction/LaneNote types, the global
                          size (get/set/applyActiveInstrument), and the live maps
                          derived from the layout — LANE_NOTES, LANE_COLORS,
                          KEY_CODES (spatial grid), NOTE_CANDIDATES, LANE_BUTTONS
  instrument/presets.ts   note-frequency preset store (localStorage, per instrument
                          size) + Preset type + findPresetVersionMismatches

  songs/songs.ts          song model: Song/Note/Section types, chart parser (1–30),
                          buildSong, DIFFICULTIES/DIFF_CLASS, chartNoteCount,
                          chartRequiredButtons, chartOutOfRange, withLeadIn
  songs/songLibrary.ts    song store (localStorage) + built-in song defs +
                          findSongVersionMismatches
  songs/builtinSongs/     raw JSON defs for each built-in song

  scoring/timing.ts       playfield clock/geometry: LEAD_TIME, hit windows,
                          noteProgress()/noteVisible() (vertical fall)
  scoring/scoring.ts      accuracy → rank badge (rankFor)

  audio/sound.ts          Web Audio "toy concertina" synth (reads LANE_NOTES)
  audio/pitch.ts          mic pitch detection (autocorrelation) → button note

  engine/gameEngineCore.ts the stateless engine: stepEngine(state, input) -> {state, events} —
                          clock, hit/miss judging, hold accrual, mic onset debounce, scoring
  engine/useGameEngine.ts the impure shell around it: rAF, keyboard + mic input, playing
                          sounds, logging, pause, calling onFinish

  utils/general.ts        generic helpers (jsonErrorText, slug, downloadJSON)
  utils/colors.ts         colour math (randomAccentColor + WCAG contrast)
  utils/storageVersion.ts generic localStorage "model version" scan/delete helpers, used by
                          instrument/presets.ts and songs/songLibrary.ts (each keeps its own
                          version constant) to find/clear outdated saved records

  ui/components/           reusable UI
    Modal/                <dialog>-based modal: focus trap, Escape, backdrop, portaled
    Accordion/            collapsible "paper" card; `inert` when collapsed
    SegmentedControl/     connected single-select buttons (radiogroup + arrow keys)
    Switch/               OFF/ON toggle (role="switch")
    ListRow/              "paper card" row for the song library + preset picker
    UploadButton/         button + hidden file input that parses a JSON upload
    NoteCard/             one falling note card (arrow + name), sized/placed by Game
    Keyboard/             the drawn anglo keyboard: three button states, tap input
    HowToPlay/            compact how-to: a falling note → a pressed button, push & pull
                          (shown on Start and in the pause overlay)
  ui/screens/
    Start/                how-to, song list, settings (instrument, speed, wait,
                          keyboard/mic, preset)
    Game/                 HUD, vertical fall zone (NoteCard) + the drawn anglo
                          Keyboard, countdown, pause overlay
    Results/              rank + stats
  ui/modals/
    ScreenGuard/          blocking overlay below MIN_APP_WIDTH (1024px)
    VersionMismatch/      blocking, non-dismissable overlay for outdated localStorage
                          presets/songs — delete only, no keep/ignore option
    PresetPicker/         list presets: select / edit / delete / new / upload
    NoteFreq/             create/edit a preset (name + per-button Hz, mic tuning)
    SongLibrary/          list songs: edit / delete / new / upload (built-ins locked)
    SongEditor/           create/edit a song (name, colour, BPM, blurb, difficulty, chart)
```

e2e/ (sibling of src/, own tsconfig.json) — Playwright browser tests; see
docs/conventions.md's "TypeScript & tooling" section.

Shared domain types live in their owning module: `InstrumentSize`/`HandGeom`/
`ButtonSpec`/`InstrumentLayout` in `instrument/layout.ts`, `Direction`/`LaneNote`
in `instrument/instrument.ts`, `Preset` in `instrument/presets.ts`,
`Song`/`Note`/`Difficulty` in `songs/songs.ts`, `Detection`/`ChordReading` in
`audio/pitch.ts`, `GameResult`/`GameNote`/`EngineState` in
`engine/gameEngineCore.ts` (re-exported from `engine/useGameEngine.ts` for UI
imports).
