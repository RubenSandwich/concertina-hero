# Domain concepts

## Instruments, buttons, lanes, push/pull

- The game supports four anglo sizes — **7 / 10 / 20 / 30 buttons** — as a global
  setting (`getActiveInstrument` / `setActiveInstrument` in `instrument/instrument.ts`,
  persisted to `localStorage`). The chosen size drives the geometry, colours, key
  labels and tuning. `instrument/layout.ts` holds the pure per-size data (see below).
- A **button = a lane**; `lane` (0…N-1) is the button's identity everywhere, and
  equals the **display number − 1**. Numbers run top-to-bottom, left-to-right
  across the screen (mirror-aware for the right hand).
- Buttons are played on a **spatial key grid** matching their on-screen positions
  (`KEY_CODES` derived from the active layout): `Q W E R T | Y U I O P` (top),
  `A S D F G | H J K L ;` (home), `Z X C V B | N M , . /` (bottom). The 7-button
  uses `Q W E R T Y U`; larger sizes fill more of the grid. Uses `event.code`, so
  it's independent of the OS keyboard layout. On-screen buttons are tappable too.
- **Push vs pull** is the bellows direction: **push = tap the key**, **pull = hold
  Shift + the key** (tapping a button's push/pull half on-screen works too). Each
  button is _bisonoric_ — a different note per direction. The live map is
  `LANE_NOTES`; `LANE_BUTTONS` is the active geometry.

## Instrument layouts (`instrument/layout.ts`)

`LAYOUTS[size]` is a pure descriptor: a `HandGeometry` (hands / cols / rows / split /
mirror / stagger) plus a flat `ButtonSpec[]` — per button its `lane`, `number`,
`hand`, `row`, `col`, on-screen `x`, `key`/`keyLabel`, `color`, and default
push/pull notes. `instrument.ts` derives the live `LANE_NOTES` / `LANE_COLORS` / `KEY_CODES` /
`NOTE_CANDIDATES` / `LANE_BUTTONS` from it, rebuilt in place when the size changes. `minInstrumentFor(buttons)` gives the smallest
size that fits a button count; `MAX_BUTTONS` is 30.

## Chart format (`songs/songs.ts`)

Charts are **instrument-agnostic** — just a sequence of button numbers. A song's
highest button (`requiredButtons`) is the smallest instrument that can play it, so
a 1–7 song plays on every size and the song list disables songs that need more
buttons than the selected instrument has. A `chart` is a whitespace/newline list
of one-beat tokens:

- `+N` push button _N_, `-N` pull button _N_ (N = 1–30); a bare `N` defaults to push.
- `X` (or `x`) is a rest — a silent beat.
- `(+1 +3)` is a chord — several buttons on the same beat (still one beat).
- Line breaks carry no timing; they only separate tokens. End a phrase with `X` to pause.

`parseChart` turns this into timed notes plus `requiredButtons`; consecutive
same-direction notes are grouped into **sections** that drive the push/pull mode
glow. `chartOutOfRange` lists button numbers outside 1–30 for the editor to flag.

## Timing & motion (`scoring/timing.ts`)

Notes **fall vertically** onto the drawn keyboard and cut off at the hit line.
`noteProgress(deltaMs)` maps a note's time-until-hit to its travel down the fall
zone (0 = top, 1 = the hit line, >1 = crossing and being clipped);
`noteVisible(progress, beatFrac)` culls a card once it has fully passed the line.
`LEAD_TIME` is the travel time; `LEAD_IN` delays the first note until after the
3-2-1 countdown. Practice **speed** scales the game clock in `useGameEngine`
(lower = slower motion and spacing). **Space** pauses.

## Held notes & scoring (`scoring/scoring.ts`)

Every note **sustains for one beat**: its hold window is `[time, time + beat)`,
which is exactly the span its card covers the hit line (a card's leading edge
reaches the line on its beat and it is one beat tall).

A press is graded on **onset timing** by `gradeFor` — `PERFECT_WINDOW` /
`GOOD_WINDOW`, else Ok — and that grade, the combo and the counts are all awarded
immediately. The note then enters the `holding` state and banks time for as long
as its button stays down. Releasing early stops the credit; pressing again while
the note is still live resumes it (`accrueHold`).

A note is **never missed for being late**. It stays playable from `HIT_WINDOW`
before its beat until `missTime` — `MISS_AT` (100%) through its hold window, i.e.
the instant its card has fallen all the way past the hit line — and is only
auto-missed if it reaches that point with nothing played (`isPlayable`). So a note
stays up until it is fully gone, even while the player is still holding the note
before it. A late press therefore always lands, but it forfeits the beat already
gone, so it can only ever bank the sliver of hold that remains. Lateness costs
points, not the note. A press claims the **oldest** playable note in its lane, so
a note you're behind on is caught before an early press can steal the next one.

A **wrong-direction press never spends the note**: pressing push when a pull is
due (or the previous note in that lane still ringing under the next one) only
flags "Wrong Way!" — it doesn't count a miss or break the combo, and the note is
left up to be played correctly, right until it falls all the way gone.

When the beat ends the note is finalized: it scores
`holdPoints(rating, holdFraction(heldMs, beat))` — the grade's points scaled by
the fraction held — plus the combo bonus banked at the press. So a note tapped
and dropped scores ~0 even at Perfect, and pressing late forfeits the part of
the beat already gone. Accuracy and rank still come from the hit **counts**, not
the hold.

In mic mode a sustained pitch counts as a held button (`isSustaining`), so
holding a real note on the instrument holds the note in game.

### Grading a mic press

A mic press is **always late**: an onset is only believed once the note has filled
the ~85ms capture window (a window still holding the previous note's tail is
rejected as transient — see below), and the two-frame debounce adds one more. That
is a systematic bias of about `MIC_LATENCY` (195ms, measured at 187-215ms), not
jitter — before it was accounted for, every one of Chord Parade's 24 notes graded
Ok and none reached Good.

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

### Transient rejection

A window caught on a note boundary holds the old note's tail, the new note's
attack, and the broadband splatter of the step between them. `analyzeChord` reads
notes out of that mess which were never played — measured down a real mic, a
phantom E appeared between every C and G. `detectChord` therefore also reports
`stable`, from `transience()`: the level difference between the window's two
halves. Correct readings sat at a median of **0.017**, every phantom at **0.418**
or above, so `TRANSIENT_MAX` of 0.3 separates them cleanly.

The engine believes an unstable reading for **nothing new**: no onsets, no change
to the sustained set. It keeps holding what it already holds, because the tail
proves those notes are still sounding.

An **empty** reading is always believed, stable or not. It has no phantoms to
guard against, and gating silence on stability stalls the release while a note
decays — which makes the same button impossible to strike again in time.

### How chord detection works

General polyphonic transcription is hard: the fundamentals are unknown, and low
notes' harmonics land on high notes' fundamentals. Two facts make it tractable
here. The concertina can only sound a **small, known set of frequencies** (two per
button — 14 on the 7-button), and the bellows move one way at a time, so a chord is
**all push or all pull** — which doubles the gap
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

### Custom tunings

The detector reads the live tuning, so a retuned instrument is picked up with no
further work — the candidate frequencies _and_ the harmonic collisions between
them are derived from whatever tuning is current. Transposing the whole instrument
works. `NOTE_CANDIDATES` (each direction's buttons in pitch order) is rebuilt
whenever the tuning or the instrument changes (`setNoteFrequencies` /
`setActiveInstrument`), so the detector never sorts or caches anything per frame.

The editor's `tuningIssues()` only checks the **value**: a missing number is an
error, and a frequency outside `MIC_MIN_HZ..MIC_MAX_HZ` (150-1200Hz, the band
`autoCorrelate` searches) is a warning. Warnings never block a save — the keyboard
plays any tuning at all.

Nothing checks whether two buttons share a pitch, because that is a **layout, not
a mistake**. A real concertina sounds the same note in several places: the same
pitch on two buttons, or a push here and a pull there.

### Aliases: the mic hears a pitch, not a button

`aliasesOf(lane, type)` returns every button/direction a heard note could have come
from — itself, plus anything tuned too close to tell apart:

- **`SAME_DIRECTION_ALIAS_HZ` (30Hz.)** A candidate scans +/- `SEARCH_BINS` around
  itself, so a closer neighbour in the same direction falls inside that scan and
  the lower note claims the peak. Swept: broken below 24Hz at 44.1kHz, below 26Hz
  at 48kHz.
- **`CROSS_DIRECTION_ALIAS_HZ` (12Hz.)** A push and a pull note never sound at
  once, but they compete to explain one peak, and the bellows direction goes to
  whichever dictionary explains more. Swept: 2-6Hz chose the wrong direction, 8Hz
  and up was reliable.

The engine resolves the ambiguity by asking the chart. `micPresses` presses
whichever alias the song is currently waiting for (`isPlayable`); if it wants none
of them, the heard one is pressed, so a genuine wrong-way press is still judged.
A heard note also **sustains** every one of its aliases — only one of them will
have a note holding, and the rest cost nothing.

Under the default tuning every note is its own only alias, so none of this fires.

### Sharps and flats

Accidentals need no special handling — nothing anywhere assumes natural notes. What
matters is the **spacing**, and a semitone is only ~15Hz at middle C but ~52Hz up at
A5. Down low a chromatic row's neighbours become aliases of each other, so playing
one credits whichever the chart wants; up high they separate cleanly. Either way it
plays.

One consequence of the overtone rule is worth knowing, and is inherent to the
layout rather than a mistake: a button that is an integer harmonic of another **in
the same direction** is ruled out as an overtone, so a chord containing both loses
the upper note. The default tuning already has three such octave pairs per direction
(C/C', E/E', G/G' on push). No shipped chart puts such a pair in one chord.

Lane order used to be a fourth assumption — `pickNotes` scanned by lane index while
relying on frequency order. They coincide with the default tuning, so tuning
button 1 above button 2 silently inverted the "lowest note first" rule and let a
sub-harmonic be claimed. The dictionaries are now sorted by frequency, which makes
the invariant true by construction.

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
`BUILTIN_DEFS` in `songs/songLibrary.ts`; it appears automatically.
