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
| ▼ **PUSH** | just tap the button's number key  | squeeze in |
| ▲ **PULL** | hold **⇧ Shift** + the number key | draw out   |

Push notes are solid paper stickers; pull notes are striped. Each moving card
shows the **note name** to play; the lane tells you the button. A look-ahead
ribbon and HUD banner preview the upcoming push/pull direction. Match the
direction _and_ the timing to score Perfect / Good / Ok.

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
  data/instrument.ts      the 7 buttons: labels, colours, keys, the note map
  data/presets.ts         note-frequency preset store (localStorage)
  data/timing.ts          playfield clock/geometry (lead time, windows, noteX)
  data/colors.ts          colour helpers (random accessible accent)
  data/songs.ts           song model: chart parser + buildSong
  data/songLibrary.ts     built-in songs + the user song store (localStorage)
  hooks/useGameEngine.ts  animation loop, keyboard + mic input, scoring
  utils.ts                shared helpers (JSON errors, slugs, downloads)
  ui/                     each component in its own folder with a co-located .css
    components/           Modal, Accordion, SegmentedControl, Switch
    screens/              Start, Game, Results
    modals/               PresetPicker / NoteFreq  (note-frequency presets)
                          SongLibrary / SongEditor (the song library + editor)
```

## Add your own song

Built-in songs live in [`src/data/songLibrary.ts`](src/data/songLibrary.ts) (the
chart parser is in [`src/data/songs.ts`](src/data/songs.ts)). Each has a `chart`
string written in a simple tab-style notation:

- a token is `+N` (push button _N_) or `-N` (pull button _N_), where _N_ is 1–7;
  a bare number defaults to push.
- every token is one beat; a line break adds a short breath between phrases.

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
[`src/data/songLibrary.ts`](src/data/songLibrary.ts) with a `bpm` and `chart`,
and it shows up automatically. (Consecutive same-direction notes are grouped into
the look-ahead ribbon for you.)
