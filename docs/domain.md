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

## Held notes & scoring (`data/scoring.ts`)

Every note **sustains for one beat**: its hold window is `[time, time + beat)`,
which is exactly the span its card covers the hit line (cards are anchored with
their left edge on the beat and are one beat wide).

A press is graded on **onset timing** by `gradeFor` — `PERFECT_WINDOW` /
`GOOD_WINDOW`, else Ok — and that grade, the combo and the counts are all awarded
immediately. The note then enters the `holding` state and banks time for as long
as its button stays down. Releasing early stops the credit; pressing again while
the note is still live resumes it (`accrueHold`).

A note is **never missed for being late**. It stays playable from `HIT_WINDOW`
before its beat until `missTime` — `MISS_AT` (90%) through its hold window — and
is only auto-missed if it reaches that point with nothing played (`isPlayable`).
A late press therefore always lands, but it forfeits the beat already gone, so
it can only ever bank the sliver of hold that remains. Lateness costs points, not
the note. A press claims the **oldest** playable note in its lane, so a note
you're behind on is caught before an early press can steal the next one.

When the beat ends the note is finalized: it scores
`holdPoints(rating, holdFraction(heldMs, beat))` — the grade's points scaled by
the fraction held — plus the combo bonus banked at the press. So a note tapped
and dropped scores ~0 even at Perfect, and pressing late forfeits the part of
the beat already gone. Accuracy and rank still come from the hit **counts**, not
the hold.

In mic mode a sustained pitch counts as a held button (`isSustaining`), so
holding a real note on the instrument holds the note in game.

### Grading a mic press

A mic press is **always late**: the note must fill the ~85ms capture window before
the detector can name it, and the two-frame onset debounce adds one more. That is
a systematic bias of about `MIC_LATENCY` (105ms), not jitter — before it was
accounted for, every one of Chord Parade's 24 notes graded Ok and none reached
Good.

So a mic press is **rewound** by `MIC_LATENCY` before it is graded and before it
starts banking hold: the note really was sounding that long before it was heard.
Widening alone could not fix this — a "Perfect" would have to span ~190ms, a third
of a beat, and hits would still all land late.

`MIC_WINDOW_SCALE` (1.5x) then widens both grading windows for what remains, which
is real jitter: where a note's onset falls inside a frame, and how quickly a reed
speaks. The keyboard is unaffected (`scale = 1`).

## Microphone mode (`audio/pitch.ts`)

An optional input. Two detectors share one mic capture (`MIC_FFT_SIZE`, ~93ms):

- **`detectNote()`** — one fundamental, by autocorrelation over the most recent
  2048 samples, matched to the closest `LANE_NOTES` frequency within
  `TOLERANCE_CENTS`. Used by the tuning modal, which needs the cents offset.
- **`detectChord()`** — _every_ note sounding, so a chord can be held.

`useGameEngine` polls `detectChord()` each frame: a note that has just started
sounding is an onset (a press, debounced over two frames), and one that keeps
sounding sustains its note exactly as a held key does (`isSustaining`). It never
plays the synth for mic hits — the real instrument does. A throttled `[mic]`
readout is logged to help calibrate.

### How chord detection works

General polyphonic transcription is hard: the fundamentals are unknown, and low
notes' harmonics land on high notes' fundamentals. Two facts make it tractable
here. The concertina can only sound **14 known frequencies**, and the bellows move
one way at a time, so a chord is **all push or all pull** — which doubles the gap
between rival candidates (the closest same-direction pair is pull D 293.66 /
F 349.23, 55.6Hz apart, comfortably resolved by ~10.8Hz bins).

So `analyzeChord` never estimates a fundamental. Over a Hann-windowed spectrum it
repeatedly takes the **lowest** candidate that clears its gates, then rules out
everything that note explains, up to `MAX_CHORD_NOTES`. Both directions are scored
and the better-explaining one wins.

Four rules keep it honest. Every one of them was forced by a real measurement —
synthesised sawtooths pass happily without them.

- **Lowest note first, not loudest.** A note's overtones only ever lie above it,
  so the lowest surviving candidate cannot be anyone's overtone. Picking by
  salience instead lets a channel that boosts overtones pick the overtone first.
- **A candidate must sit on a local maximum of the _observed_ spectrum**, or the
  skirt of a louder neighbour's lobe reads as a quiet note. Checked against the
  untouched spectrum, while "is any energy unexplained?" is checked against the
  residual. Asking both of the residual manufactures phantoms: cancelling a band
  flattens it, so the bin at its edge is trivially a local maximum.
- **A candidate landing on an accepted note's overtone is ruled out**
  (`overtoneLanes`), not merely damped. It has no independent evidence — nothing
  can distinguish "a note here" from "the note below, with a loud overtone". Down
  a real mic, subtracting a modelled overtone instead put a phantom G6 under every
  C (its 3rd harmonic) and a phantom A7 under every A.
- **Levels are measured against the first accepted note's fundamental**, not the
  loudest bin. The loudest bin is often a harmonic: on a laptop speaker, G's 2nd
  harmonic arrived 2.3x louder than G itself, which squeezed the other chord notes
  to a ~2x margin and made them flicker in and out between frames.

The cost is that a **true octave chord is heard as its lower note alone** — the
classic octave ambiguity. Note that octaves are not the only collision: button 6
push _is_ the 3rd harmonic of button 1 push, and button 7 of button 2. No chord in
any shipped chart contains a note that is an integer harmonic of another of its
own notes, which is what makes ruling overtones out safe (both facts are pinned
by tests).

## Adding a song

Easiest: the in-app **Song library** ("Add / edit songs" on the start screen) —
write or upload a chart, saved to `localStorage`. To ship a **built-in** song,
add a raw def `{ id, name, blurb, bpm, color, difficulty, chart }` to
`BUILTIN_DEFS` in `data/songLibrary.ts`; it appears automatically.
