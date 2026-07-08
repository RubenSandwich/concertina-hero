# Architecture

Screen flow is `start → game → results`, routed in `App.tsx` with directional
View Transitions. Every UI piece lives in its own folder with the `*.css` it
imports.

```
src/
  main.tsx                entry (createRoot + StrictMode; applies the saved tuning)
  App.tsx                 screen router (start → game → results), View Transitions
  index.css               global theme + CSS vars + shared primitives (.paper/.btn/.title/.diff)

  data/instrument.ts      the 7 buttons: Direction/LaneNote types, LANE_LABELS,
                          LANE_COLORS, KEY_CODES, the live LANE_NOTES map
  data/presets.ts         note-frequency preset store (localStorage) + Preset type
  data/songs.ts           song model: Song/Note/Section types, chart parser, buildSong,
                          DIFFICULTIES/DIFF_CLASS, chartNoteCount, withLeadIn
  data/songLibrary.ts     song store (localStorage) + built-in song defs
  data/timing.ts          playfield clock/geometry: LEAD_TIME, hit windows, noteX()
  data/colors.ts          colour math (randomAccentColor + WCAG contrast)
  data/scoring.ts         accuracy → rank badge (rankFor)

  audio/sound.ts          Web Audio "toy concertina" synth (reads LANE_NOTES)
  audio/pitch.ts          mic pitch detection (autocorrelation) → button note

  hooks/useGameEngine.ts  the game loop: rAF, keyboard + mic input, scoring, pause, phases
  utils.ts                generic helpers (jsonErrorText, slug, downloadJSON)

  ui/components/           reusable UI
    Modal/                <dialog>-based modal: focus trap, Escape, backdrop, portaled
    Accordion/            collapsible "paper" card; `inert` when collapsed
    SegmentedControl/     connected single-select buttons (radiogroup + arrow keys)
    Switch/               OFF/ON toggle (role="switch")
    ListRow/              "paper card" row for the song library + preset picker
    UploadButton/         button + hidden file input that parses a JSON upload
  ui/screens/
    Start/                how-to, song list, settings (speed, wait, mic, preset)
    Game/                 HUD, section ribbon, lanes, notes, countdown, pause overlay
    Results/              rank + stats
  ui/modals/
    PresetPicker/         list presets: select / edit / delete / new / upload
    NoteFreq/             create/edit a preset (name + per-button Hz, mic tuning)
    SongLibrary/          list songs: edit / delete / new / upload (built-ins locked)
    SongEditor/           create/edit a song (name, colour, BPM, blurb, difficulty, chart)
```

Shared domain types live in their owning module: `Direction`/`LaneNote` in
`data/instrument.ts`, `Preset` in `data/presets.ts`, `Song`/`Note`/`Difficulty`
in `data/songs.ts`, `Detection` in `audio/pitch.ts`, `GameResult`/`GameNote` in
`hooks/useGameEngine.ts`.
