// Playfield clock & geometry: how long a note travels, the timing windows that
// grade a hit, and the mapping from time-until-hit to an on-screen x-position.

// How long (ms) a note is visible before it must be hit.
export const LEAD_TIME = 2200

// Extra silent runway (ms) added before the first note so the 3-2-1 countdown
// fully finishes before anything scrolls in. One note's travel time (plus a
// small breather) means the playfield is empty until "1" disappears.
export const LEAD_IN = LEAD_TIME + 200

// Horizontal position of the hit line, as a percent from the left edge.
export const HIT_LINE_PCT = 17

// Timing windows (ms) measured from the ideal hit moment. They grade a press;
// they no longer decide when a note is given up on (see MISS_AT).
export const PERFECT_WINDOW = 70
export const GOOD_WINDOW = 125
export const HIT_WINDOW = 185 // largest *early* offset that still counts as a hit

// A mic press is always late: an onset is only believed once the note has filled
// the capture window (a window still holding the previous note's tail is rejected
// as transient, or it yields phantom notes), and the two-frame debounce adds one
// more frame on top. Measured end to end against a real mic, an onset fires
// 187-215ms after the note starts.
//
// This is a *bias*, not jitter, so it is subtracted rather than tolerated —
// widening alone would need a "Perfect" spanning a third of a beat, and every mic
// hit would still grade late. Playing Chord Parade through a real mic before this,
// all 24 notes graded Ok and none reached Good.
export const MIC_LATENCY = 195

// What is left after removing the bias is jitter: where the note's onset falls
// inside a frame, and how fast a real reed speaks. Mic windows are widened for it.
export const MIC_WINDOW_SCALE = 1.5

// A note is only missed once it is this far through its one-beat hold window
// with nothing played — by then its card has all but left the hit line. Until
// that moment a late press still catches it, though so little of the beat is
// left that it scores next to nothing.
export const MISS_AT = 0.9

// The moment an untouched note becomes a miss.
export function missTime(noteTime: number, holdMs: number): number {
  return noteTime + holdMs * MISS_AT
}

// Whether a note can still be played at `now`: from HIT_WINDOW before its beat
// right up until the instant it would be missed.
export function isPlayable(now: number, noteTime: number, holdMs: number): boolean {
  return now >= noteTime - HIT_WINDOW && now < missTime(noteTime, holdMs)
}

// Convert a note's time-until-hit into a horizontal percent position.
// delta === LEAD_TIME  -> just entering from the right edge (~100%)
// delta === 0          -> exactly on the hit line
// delta < 0            -> already swept past the hit line (moving off left)
export function noteX(delta: number): number {
  return HIT_LINE_PCT + (delta / LEAD_TIME) * (100 - HIT_LINE_PCT)
}
