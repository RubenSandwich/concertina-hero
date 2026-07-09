# Domain concepts

## Buttons, lanes, push/pull

- **7 buttons = 7 lanes**, played with the number keys **1–7** (`KEY_CODES` in
  `data/instrument.ts` maps `Digit1..7` / `Numpad1..7` to lane indices 0–6).
- **Push vs pull** is the bellows direction: **push = tap the key**, **pull =
  hold Shift + the key**. Each button is _bisonoric_ — a different note per
  direction (button 1 = C push / D pull). The full map is `LANE_NOTES` in
  `data/instrument.ts`.

## Chart format (`data/songs.ts`)

A song's `chart` is a whitespace/newline list of one-beat tokens:

- `+N` push button _N_, `-N` pull button _N_ (N = 1–7); a bare `N` defaults to push.
- `X` (or `x`) is a rest — a silent beat.
- `(+1 +3)` is a chord — several buttons on the same beat (still one beat).
- Line breaks carry no timing; they only separate tokens. End a phrase with `X` to pause.

`parseChart` turns this into timed notes; consecutive same-direction notes are
grouped into **sections** that drive the look-ahead ribbon.

## Timing & motion (`data/timing.ts`)

`noteX(deltaMs)` maps a note's time-until-hit to an x-position percent.
`LEAD_TIME` is the travel time; `LEAD_IN` delays the first note until after the
3-2-1 countdown. Practice **speed** scales the game clock in `useGameEngine`
(lower = slower motion and spacing). **Space** pauses.

## Microphone mode (`audio/pitch.ts`)

An optional input: the mic listens, autocorrelation estimates the pitch, and it's
matched to the closest `LANE_NOTES` frequency (within ~60 cents) to fire a button
press — the note itself encodes push vs pull. `useGameEngine` polls `detectNote()`
each frame and debounces onsets; it never plays the synth for mic hits (the real
instrument does). While on, the engine logs a throttled `[mic]` readout to help
calibrate a real instrument.

## Adding a song

Easiest: the in-app **Song library** ("Add / edit songs" on the start screen) —
write or upload a chart, saved to `localStorage`. To ship a **built-in** song,
add a raw def `{ id, name, blurb, bpm, color, difficulty, chart }` to
`BUILTIN_DEFS` in `data/songLibrary.ts`; it appears automatically.
