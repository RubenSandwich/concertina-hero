# Architecture

Screen flow is `start → game → results`, routed in `App.tsx` with directional
View Transitions. Every UI piece lives in its own folder with the `*.css` it
imports.

```
src/
  main.tsx                entry (createRoot + StrictMode; applies the saved tuning)
  App.tsx                 screen router (start → game → results), View Transitions
  index.css               global theme + CSS vars + shared primitives (.paper/.btn/.title/.diff)

  data/layout.ts          per-size anglo layouts (7/10/20/30): HandGeom + ButtonSpec,
                          geometry/numbering/colours/key grid/default notes, LAYOUTS,
                          minInstrumentFor, MAX_BUTTONS
  data/instrument.ts      the active instrument: Direction/LaneNote types, the global
                          size (get/set/applyActiveInstrument), and the live maps
                          derived from the layout — LANE_NOTES, LANE_COLORS,
                          KEY_CODES (spatial grid), NOTE_CANDIDATES, LANE_BUTTONS
  data/presets.ts         note-frequency preset store (localStorage, per instrument
                          size) + Preset type
  data/songs.ts           song model: Song/Note/Section types, chart parser (1–30),
                          buildSong, DIFFICULTIES/DIFF_CLASS, chartNoteCount,
                          chartRequiredButtons, chartOutOfRange, withLeadIn
  data/songLibrary.ts     song store (localStorage) + built-in song defs
  data/timing.ts          playfield clock/geometry: LEAD_TIME, hit windows,
                          noteProgress()/noteVisible() (vertical fall)
  data/colors.ts          colour math (randomAccentColor + WCAG contrast)
  data/scoring.ts         accuracy → rank badge (rankFor)

  audio/sound.ts          Web Audio "toy concertina" synth (reads LANE_NOTES)
  audio/pitch.ts          mic pitch detection (autocorrelation) → button note

  hooks/gameEngineCore.ts the stateless engine: stepEngine(state, input) -> {state, events} —
                          clock, hit/miss judging, hold accrual, mic onset debounce, scoring
  hooks/useGameEngine.ts  the impure shell around it: rAF, keyboard + mic input, playing
                          sounds, logging, pause, calling onFinish
  utils.ts                generic helpers (jsonErrorText, slug, downloadJSON)

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
    PresetPicker/         list presets: select / edit / delete / new / upload
    NoteFreq/             create/edit a preset (name + per-button Hz, mic tuning)
    SongLibrary/          list songs: edit / delete / new / upload (built-ins locked)
    SongEditor/           create/edit a song (name, colour, BPM, blurb, difficulty, chart)
```

Shared domain types live in their owning module: `InstrumentSize`/`HandGeom`/
`ButtonSpec`/`InstrumentLayout` in `data/layout.ts`, `Direction`/`LaneNote` in
`data/instrument.ts`, `Preset` in `data/presets.ts`, `Song`/`Note`/`Difficulty`
in `data/songs.ts`, `Detection`/`ChordReading` in `audio/pitch.ts`,
`GameResult`/`GameNote`/`EngineState` in `hooks/gameEngineCore.ts` (re-exported
from `hooks/useGameEngine.ts` for UI imports).
