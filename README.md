# 🪗 Concertina Hero

A "Guitar Hero" style rhythm game for **toy concertinas**, built with React, Vite
and TypeScript, and dressed up in a bright, cut-from-paper **Paper Mario /
paper-mache** style.

Notes fly in from the **right** across **7 lanes** — the seven concertina buttons,
played with the number keys **1 · 2 · 3 · 4 · 5 · 6 · 7** — and you play them as
they cross the dashed hit line on the left.

## Push vs. Pull

A real toy concertina is _bisonoric_: each button sounds a different note
depending on whether you squeeze the bellows in (**push**) or draw them out
(**pull**). Each note tells you which way to go:

| Direction  | What to press                     | Bellows    |
| ---------- | --------------------------------- | ---------- |
| ▼ **PUSH** | hold the button's number key      | squeeze in |
| ▲ **PULL** | hold **⇧ Shift** + the number key | draw out   |

Push notes are solid paper stickers; pull notes are striped. Each moving card
shows the **note name** to play; the lane tells you the button. A look-ahead
ribbon and HUD banner preview the upcoming push/pull direction. Match the
direction _and_ the timing to score Perfect / Good / Ok.

Notes are **held**, not tapped. Each card is one beat wide, and you keep its
button down for as long as the card sits on the hit line. Your timing picks the
grade; how much of the beat you actually hold decides how many of that grade's
points you keep — so a note stabbed and dropped scores almost nothing.

### Button → note map

| Button | Push       | Pull     |
| ------ | ---------- | -------- |
| 1      | C (middle) | D        |
| 2      | E          | F        |
| 3      | G          | A        |
| 4      | C (high)   | B        |
| 5      | E (high)   | D (high) |
| 6      | G (high)   | F (high) |
| 7      | B (high)   | A (high) |

## Practice speed

Learning a chart? Pick **0.5×**, **0.75×**, or **1×** on the start screen. Lower
speeds slow the whole song down — notes move slower and are spaced further
apart — so you can rehearse the push/pull switches before going full tempo.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (it opens automatically). Build for production with
`npm run build` and preview with `npm run preview`.

## Project layout

```
src/
  main.tsx                entry (createRoot + StrictMode)
  App.tsx                 screen router (start → game → results)
  index.css               global theme + shared primitives (paper theme)
  audio/sound.ts          tiny Web Audio "toy concertina" synth
  audio/pitch.ts          mic pitch detection (autocorrelation)
  instrument/instrument.ts the 7 buttons: labels, colours, keys, the note map
  instrument/presets.ts   note-frequency preset store (localStorage)
  scoring/timing.ts       playfield clock/geometry (lead time, windows, noteX)
  scoring/scoring.ts      accuracy → rank badge
  songs/songs.ts          song model: chart parser + buildSong
  songs/songLibrary.ts    built-in songs + the user song store (localStorage)
  engine/core.ts          the stateless engine core: stepEngine(state, input)
  engine/useGameEngine.ts the impure shell: rAF, keyboard + mic input, sounds
  utils/general.ts        shared helpers (JSON errors, slugs, downloads)
  utils/colors.ts         colour helpers (random accessible accent)
  utils/storageVersion.ts localStorage "schema version" scan/delete helpers
  ui/                     each component in its own folder with a co-located .css
    components/           Modal, Accordion, SegmentedControl, Switch
    screens/              Start, Game, Results
    modals/               PresetPicker / NoteFreq  (note-frequency presets)
                          SongLibrary / SongEditor (the song library + editor)
```

## Add your own song

Built-in songs live in [`src/songs/songLibrary.ts`](src/songs/songLibrary.ts) (the
chart parser is in [`src/songs/songs.ts`](src/songs/songs.ts)). Each has a `chart`
string written in a simple tab-style notation:

- a token is `+N` (push button _N_) or `-N` (pull button _N_), where _N_ is 1–7;
  a bare number defaults to push.
- every token is one beat; `X` is a rest. Line breaks are only for readability —
  to pause between phrases, end the phrase with an `X`.

For example, "Row, Row, Row Your Boat":

```
+3 +3 +3 -3 -4
-4 -3 -4 +4 -5
+6 +6 +6
-5 -5 -5
-4 -4 -4
+3
-5 +4 -4 -3 +3
```

The easiest way is right in the app: open **Add / edit songs** on the start
screen to write, upload, edit, or delete songs — they're saved to your browser's
`localStorage`. To add a built-in song, drop a new entry into `BUILTIN_DEFS` in
[`src/songs/songLibrary.ts`](src/songs/songLibrary.ts) with a `bpm` and `chart`,
and it shows up automatically. (Consecutive same-direction notes are grouped into
the look-ahead ribbon for you.)
